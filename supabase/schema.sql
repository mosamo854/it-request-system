-- Run this entire file in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create schema if not exists private;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (
    name = trim(name)
    and char_length(name) between 2 and 80
    and name <> 'ทุกแผนก'
  ),
  created_at timestamptz not null default now()
);

create unique index if not exists departments_name_lower_idx
  on public.departments (lower(name));

insert into public.departments (name)
values
  ('ฝ่าย IT'),
  ('ฝ่ายขาย'),
  ('ฝ่ายบุคคล'),
  ('ฝ่ายบัญชี'),
  ('ฝ่ายปฏิบัติการ')
on conflict do nothing;

-- Preserve valid department metadata from Auth users created before this table.
insert into public.departments (name)
select distinct trim(raw_user_meta_data ->> 'department')
from auth.users
where nullif(trim(raw_user_meta_data ->> 'department'), '') is not null
  and char_length(trim(raw_user_meta_data ->> 'department')) between 2 and 80
  and trim(raw_user_meta_data ->> 'department') <> 'ทุกแผนก'
on conflict do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null check (char_length(full_name) between 2 and 120),
  department text references public.departments(name) on update cascade,
  phone text check (phone is null or phone ~ '^[+]66[0-9]{8,9}$'),
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists phone text;

do $$
declare
  permissions_was_missing boolean;
begin
  select not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'permissions'
  ) into permissions_was_missing;

  alter table public.profiles
    add column if not exists permissions text[] not null default '{}'::text[];

  if permissions_was_missing then
    update public.profiles
    set permissions = array[
      'requests.view',
      'requests.update',
      'requests.archive',
      'archive.view',
      'archive.restore',
      'archive.delete',
      'statistics.view',
      'statistics.export',
      'activity.view',
      'activity.export',
      'users.view',
      'users.create',
      'users.update',
      'departments.create'
    ]::text[]
    where role = 'admin';
  end if;
end
$$;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'user'));

alter table public.profiles
  drop constraint if exists profiles_permissions_check;

alter table public.profiles
  add constraint profiles_permissions_check
  check (
    permissions <@ array[
      'requests.view',
      'requests.update',
      'requests.archive',
      'archive.view',
      'archive.restore',
      'archive.delete',
      'statistics.view',
      'statistics.export',
      'activity.view',
      'activity.export',
      'users.view',
      'users.create',
      'users.update',
      'departments.create'
    ]::text[]
  );

alter table public.profiles
  drop constraint if exists profiles_department_check;

alter table public.profiles
  drop constraint if exists profiles_phone_check;

alter table public.profiles
  add constraint profiles_phone_check
  check (phone is null or phone ~ '^[+]66[0-9]{8,9}$');

insert into public.departments (name)
select distinct trim(department)
from public.profiles
where nullif(trim(department), '') is not null
on conflict do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_department_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_department_fkey
      foreign key (department) references public.departments(name)
      on update cascade;
  end if;
end
$$;

create or replace function private.normalize_thai_phone(raw_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  with normalized as (
    select regexp_replace(coalesce(raw_phone, ''), '[^0-9+]', '', 'g') as value
  )
  select case
    when value ~ '^0[0-9]{8,9}$' then '+66' || substr(value, 2)
    when value ~ '^[+]66[0-9]{8,9}$' then value
    else null
  end
  from normalized;
$$;

revoke all on function private.normalize_thai_phone(text) from public;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null then
    return new;
  end if;

  insert into public.profiles (id, email, full_name, department, phone, role)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      case
        when char_length(split_part(new.email, '@', 1)) >= 2
          then split_part(new.email, '@', 1)
        else 'ผู้ใช้งาน'
      end
    ),
    nullif(trim(new.raw_user_meta_data ->> 'department'), ''),
    private.normalize_thai_phone(new.raw_user_meta_data ->> 'phone'),
    'user'
  )
  on conflict (id) do update
  set email = excluded.email,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email on auth.users
for each row execute function public.handle_new_auth_user();

-- Backfill profiles for accounts that existed before this role system.
insert into public.profiles (
  id, email, full_name, department, phone, role, created_at
)
select
  id,
  lower(coalesce(email, '')),
  coalesce(
    nullif(trim(raw_user_meta_data ->> 'full_name'), ''),
    case
      when char_length(split_part(email, '@', 1)) >= 2
        then split_part(email, '@', 1)
      else 'ผู้ใช้งาน'
    end
  ),
  nullif(trim(raw_user_meta_data ->> 'department'), ''),
  private.normalize_thai_phone(raw_user_meta_data ->> 'phone'),
  'user',
  created_at
from auth.users
where email is not null
on conflict (id) do update
set email = excluded.email,
    updated_at = now();

create or replace function private.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = check_user_id
      and role in ('super_admin', 'admin')
  );
$$;

revoke all on function private.is_admin(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin(uuid) to authenticated;

create or replace function private.is_super_admin(
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = check_user_id
      and role = 'super_admin'
  );
$$;

create or replace function private.has_permission(
  permission_key text,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = check_user_id
      and (
        role = 'super_admin'
        or (
          role = 'admin'
          and permission_key = any(permissions)
        )
      )
  );
$$;

revoke all on function private.is_super_admin(uuid) from public;
revoke all on function private.has_permission(text, uuid) from public;
grant execute on function private.is_super_admin(uuid) to authenticated;
grant execute on function private.has_permission(text, uuid) to authenticated;

create or replace function private.can_access_department(
  request_department text,
  permission_key text,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = check_user_id
      and (
        role = 'super_admin'
        or (
          role = 'admin'
          and department = request_department
          and permission_key = any(permissions)
        )
      )
  );
$$;

revoke all on function private.can_access_department(text, text, uuid)
  from public;
grant execute on function private.can_access_department(text, text, uuid)
  to authenticated;

create or replace function public.generate_request_code()
returns text
language sql
volatile
as $$
  select 'REQ-' || to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD') || '-' ||
         upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

create table if not exists public.it_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.generate_request_code(),
  requester_user_id uuid references auth.users(id) on delete set null,
  requester_name text not null check (char_length(requester_name) between 2 and 120),
  requester_email text not null,
  department text not null references public.departments(name) on update cascade,
  target_department text not null references public.departments(name) on update cascade,
  category text not null,
  priority text not null default 'normal' check (
    priority in ('urgent', 'normal', 'low')
  ),
  subject text not null check (char_length(subject) between 3 and 120),
  detail text not null check (char_length(detail) between 3 and 3000),
  image_path text,
  attachment_name text check (char_length(attachment_name) between 1 and 255),
  attachment_mime_type text check (
    char_length(attachment_mime_type) between 1 and 150
  ),
  attachment_size integer check (
    attachment_size between 1 and 10485760
  ),
  status text not null default 'waiting' check (
    status in ('waiting', 'in_progress', 'done')
  ),
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_to_name text,
  assigned_at timestamptz,
  assigned_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep this outside CREATE TABLE so rerunning this file also repairs an
-- existing table that was created by an older version of the script.
alter table public.it_requests
  drop constraint if exists it_requests_requester_email_check;

alter table public.it_requests
  add constraint it_requests_requester_email_check
  check (
    requester_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$'
  );

alter table public.it_requests
  add column if not exists image_path text;

alter table public.it_requests
  add column if not exists attachment_name text;

alter table public.it_requests
  add column if not exists attachment_mime_type text;

alter table public.it_requests
  add column if not exists attachment_size integer;

alter table public.it_requests
  drop constraint if exists it_requests_attachment_name_check;

alter table public.it_requests
  add constraint it_requests_attachment_name_check
  check (
    attachment_name is null
    or char_length(attachment_name) between 1 and 255
  );

alter table public.it_requests
  drop constraint if exists it_requests_attachment_mime_type_check;

alter table public.it_requests
  add constraint it_requests_attachment_mime_type_check
  check (
    attachment_mime_type is null
    or char_length(attachment_mime_type) between 1 and 150
  );

alter table public.it_requests
  drop constraint if exists it_requests_attachment_size_check;

alter table public.it_requests
  add constraint it_requests_attachment_size_check
  check (
    attachment_size is null
    or attachment_size between 1 and 10485760
  );

alter table public.it_requests
  add column if not exists requester_user_id uuid;

alter table public.it_requests
  add column if not exists target_department text;

alter table public.it_requests
  add column if not exists assigned_to uuid;

alter table public.it_requests
  add column if not exists assigned_to_name text;

alter table public.it_requests
  add column if not exists assigned_at timestamptz;

alter table public.it_requests
  add column if not exists assigned_by uuid;

update public.it_requests
set target_department = 'ฝ่าย IT'
where target_department is null;

alter table public.it_requests
  alter column target_department set not null;

alter table public.it_requests
  alter column code set default public.generate_request_code();

alter table public.it_requests
  add column if not exists archived_at timestamptz;

alter table public.it_requests
  add column if not exists archived_by uuid;

alter table public.it_requests
  drop constraint if exists it_requests_department_check;

insert into public.departments (name)
select distinct trim(department)
from public.it_requests
where nullif(trim(department), '') is not null
on conflict do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'it_requests_requester_user_id_fkey'
      and conrelid = 'public.it_requests'::regclass
  ) then
    alter table public.it_requests
      add constraint it_requests_requester_user_id_fkey
      foreign key (requester_user_id) references auth.users(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'it_requests_assigned_to_fkey'
      and conrelid = 'public.it_requests'::regclass
  ) then
    alter table public.it_requests
      add constraint it_requests_assigned_to_fkey
      foreign key (assigned_to) references auth.users(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'it_requests_assigned_by_fkey'
      and conrelid = 'public.it_requests'::regclass
  ) then
    alter table public.it_requests
      add constraint it_requests_assigned_by_fkey
      foreign key (assigned_by) references auth.users(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'it_requests_archived_by_fkey'
      and conrelid = 'public.it_requests'::regclass
  ) then
    alter table public.it_requests
      add constraint it_requests_archived_by_fkey
      foreign key (archived_by) references auth.users(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'it_requests_department_fkey'
      and conrelid = 'public.it_requests'::regclass
  ) then
    alter table public.it_requests
      add constraint it_requests_department_fkey
      foreign key (department) references public.departments(name)
      on update cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'it_requests_target_department_fkey'
      and conrelid = 'public.it_requests'::regclass
  ) then
    alter table public.it_requests
      add constraint it_requests_target_department_fkey
      foreign key (target_department) references public.departments(name)
      on update cascade;
  end if;
end
$$;

-- Link old requests to an Auth account when the email already matches.
update public.it_requests as request
set requester_user_id = auth_user.id
from auth.users as auth_user
where request.requester_user_id is null
  and lower(request.requester_email) = lower(auth_user.email);

create index if not exists it_requests_department_idx
  on public.it_requests (department);

create index if not exists it_requests_target_department_idx
  on public.it_requests (target_department, created_at desc);

create index if not exists it_requests_status_idx
  on public.it_requests (status);

create index if not exists it_requests_created_at_idx
  on public.it_requests (created_at desc);

create index if not exists it_requests_archived_at_idx
  on public.it_requests (archived_at desc)
  where archived_at is not null;

create index if not exists it_requests_requester_user_id_idx
  on public.it_requests (requester_user_id, created_at desc);

create index if not exists it_requests_assigned_to_idx
  on public.it_requests (assigned_to, created_at desc)
  where assigned_to is not null;

create or replace function public.get_assignable_members(
  request_department text
)
returns table (
  id uuid,
  full_name text,
  role text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not private.can_access_department(
       request_department,
       'requests.update',
       auth.uid()
     ) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์ดูรายชื่อผู้รับผิดชอบของแผนกนี้'
      using errcode = '42501';
  end if;

  return query
  select profile.id, profile.full_name, profile.role
  from public.profiles as profile
  where profile.department = request_department
    and profile.role in ('admin', 'user')
  order by profile.full_name;
end;
$$;

create or replace function public.assign_request(
  target_request_id uuid,
  target_assignee_id uuid default null
)
returns public.it_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.it_requests%rowtype;
  assignee_name text;
  updated_request public.it_requests%rowtype;
begin
  select request.*
  into request_record
  from public.it_requests as request
  where request.id = target_request_id;

  if not found then
    raise exception 'ไม่พบคำขอที่ต้องการมอบหมาย'
      using errcode = 'P0002';
  end if;

  if request_record.archived_at is not null then
    raise exception 'ไม่สามารถมอบหมายคำขอที่อยู่ในคลังสำรองได้'
      using errcode = '22023';
  end if;

  if auth.uid() is null
     or not private.can_access_department(
       request_record.target_department,
       'requests.update',
       auth.uid()
     ) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์มอบหมายคำขอของแผนกนี้'
      using errcode = '42501';
  end if;

  if target_assignee_id is not null then
    select profile.full_name
    into assignee_name
    from public.profiles as profile
    where profile.id = target_assignee_id
      and profile.department = request_record.target_department
      and profile.role in ('admin', 'user');

    if not found then
      raise exception 'ผู้รับผิดชอบต้องเป็นสมาชิกของแผนกปลายทาง'
        using errcode = '22023';
    end if;
  end if;

  update public.it_requests
  set assigned_to = target_assignee_id,
      assigned_to_name = assignee_name,
      assigned_at = case
        when target_assignee_id is null then null
        else now()
      end,
      assigned_by = case
        when target_assignee_id is null then null
        else auth.uid()
      end
  where id = target_request_id
  returning * into updated_request;

  return updated_request;
end;
$$;

revoke all on function public.get_assignable_members(text) from public;
revoke all on function public.assign_request(uuid, uuid) from public;
grant execute on function public.get_assignable_members(text) to authenticated;
grant execute on function public.assign_request(uuid, uuid) to authenticated;

create table if not exists public.it_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.it_requests(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_email text not null,
  body text not null default '',
  image_path text,
  attachment_name text check (char_length(attachment_name) between 1 and 255),
  attachment_mime_type text check (
    char_length(attachment_mime_type) between 1 and 150
  ),
  attachment_size integer check (
    attachment_size between 1 and 10485760
  ),
  created_at timestamptz not null default now()
);

-- Upgrade message tables created by an older version so image-only messages
-- are valid while keeping text messages limited to 2,000 characters.
alter table public.it_request_messages
  add column if not exists image_path text;

alter table public.it_request_messages
  add column if not exists attachment_name text;

alter table public.it_request_messages
  add column if not exists attachment_mime_type text;

alter table public.it_request_messages
  add column if not exists attachment_size integer;

alter table public.it_request_messages
  drop constraint if exists it_request_messages_attachment_name_check;

alter table public.it_request_messages
  add constraint it_request_messages_attachment_name_check
  check (
    attachment_name is null
    or char_length(attachment_name) between 1 and 255
  );

alter table public.it_request_messages
  drop constraint if exists it_request_messages_attachment_mime_type_check;

alter table public.it_request_messages
  add constraint it_request_messages_attachment_mime_type_check
  check (
    attachment_mime_type is null
    or char_length(attachment_mime_type) between 1 and 150
  );

alter table public.it_request_messages
  drop constraint if exists it_request_messages_attachment_size_check;

alter table public.it_request_messages
  add constraint it_request_messages_attachment_size_check
  check (
    attachment_size is null
    or attachment_size between 1 and 10485760
  );

alter table public.it_request_messages
  alter column body set default '';

alter table public.it_request_messages
  drop constraint if exists it_request_messages_body_check;

alter table public.it_request_messages
  drop constraint if exists it_request_messages_body_or_image_check;

alter table public.it_request_messages
  add constraint it_request_messages_body_or_image_check
  check (
    char_length(trim(body)) between 1 and 2000
    or image_path is not null
  );

create index if not exists it_request_messages_request_id_idx
  on public.it_request_messages (request_id, created_at);

create or replace function private.can_access_request_image(
  object_name text,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.it_requests as request
    where (
      request.requester_user_id = check_user_id
      or request.assigned_to = check_user_id
      or (
        request.archived_at is null
        and private.can_access_department(
          request.target_department,
          'requests.view',
          check_user_id
        )
      )
      or (
        request.archived_at is not null
        and private.can_access_department(
          request.target_department,
          'archive.view',
          check_user_id
        )
      )
    )
    and (
      request.image_path = object_name
      or exists (
        select 1
        from public.it_request_messages as message
        where message.request_id = request.id
          and message.image_path = object_name
      )
    )
  );
$$;

revoke all on function private.can_access_request_image(text, uuid) from public;
grant execute on function private.can_access_request_image(text, uuid)
  to authenticated;

-- Private image bucket. The browser receives a short-lived signed URL only
-- after Supabase confirms that the requester is authenticated.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'it-request-images',
  'it-request-images',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'text/markdown',
    'application/json'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_it_requests_updated_at on public.it_requests;
create trigger set_it_requests_updated_at
before update on public.it_requests
for each row execute function public.set_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function private.enforce_it_request_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or private.is_super_admin(auth.uid()) then
    return new;
  end if;

  if old.status is distinct from new.status
     and old.assigned_to is distinct from auth.uid()
     and not private.can_access_department(
       old.target_department,
       'requests.update',
       auth.uid()
     ) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์เปลี่ยนสถานะคำขอ'
      using errcode = '42501';
  end if;

  if old.archived_at is null and new.archived_at is not null
     and not private.can_access_department(
       old.target_department,
       'requests.archive',
       auth.uid()
     ) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์เก็บคำขอในคลังสำรอง'
      using errcode = '42501';
  end if;

  if old.archived_at is not null and new.archived_at is null
     and not private.can_access_department(
       old.target_department,
       'archive.restore',
       auth.uid()
     ) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์กู้คืนคำขอ'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_it_request_permissions() from public;

drop trigger if exists enforce_it_request_permissions on public.it_requests;
create trigger enforce_it_request_permissions
before update of status, archived_at, archived_by on public.it_requests
for each row execute function private.enforce_it_request_permissions();

alter table public.it_requests enable row level security;

alter table public.profiles enable row level security;

alter table public.departments enable row level security;

drop policy if exists "Authenticated users can read departments"
  on public.departments;
create policy "Authenticated users can read departments"
on public.departments for select
to authenticated
using (true);

drop policy if exists "Admins can create departments"
  on public.departments;
create policy "Admins can create departments"
on public.departments for insert
to authenticated
with check (private.has_permission('departments.create'));

revoke all on table public.departments from anon, authenticated;
grant select, insert on table public.departments to authenticated;

drop policy if exists "Users can read their own profile and admins can read all"
  on public.profiles;
create policy "Users can read their own profile and admins can read all"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or private.has_permission('users.view')
);

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

drop policy if exists "Anyone can read IT requests" on public.it_requests;
drop policy if exists "Authenticated users can read IT requests" on public.it_requests;
drop policy if exists "Users read own requests and admins read all" on public.it_requests;
create policy "Users read own requests and admins read all"
on public.it_requests for select
to authenticated
using (
  requester_user_id = auth.uid()
  or assigned_to = auth.uid()
  or (
    archived_at is null
    and private.can_access_department(target_department, 'requests.view')
  )
  or (
    archived_at is not null
    and private.can_access_department(target_department, 'archive.view')
  )
  or private.can_access_department(target_department, 'statistics.view')
);

drop policy if exists "Anyone can create a waiting request" on public.it_requests;
drop policy if exists "Authenticated users can create a waiting request" on public.it_requests;
drop policy if exists "Users can create their own waiting request" on public.it_requests;
create policy "Users can create their own waiting request"
on public.it_requests for insert
to authenticated
with check (
  status = 'waiting'
  and requester_user_id = auth.uid()
  and lower(requester_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  and archived_at is null
  and archived_by is null
  and assigned_to is null
  and assigned_to_name is null
  and assigned_at is null
  and assigned_by is null
  and exists (
    select 1
    from public.profiles as profile
    where profile.id = auth.uid()
      and profile.full_name = requester_name
      and profile.email = requester_email
      and profile.department = department
      and profile.role = 'user'
  )
  and (
    (
      image_path is null
      and attachment_name is null
      and attachment_mime_type is null
      and attachment_size is null
    )
    or (
      image_path is not null
      and split_part(image_path, '/', 1) = auth.uid()::text
      and attachment_name is not null
      and attachment_mime_type is not null
      and attachment_size is not null
    )
  )
);

drop policy if exists "Anyone can update request status" on public.it_requests;
drop policy if exists "Authenticated users can update request status" on public.it_requests;
drop policy if exists "Admins can update and archive requests" on public.it_requests;
create policy "Admins can update and archive requests"
on public.it_requests for update
to authenticated
using (
  assigned_to = auth.uid()
  or private.can_access_department(target_department, 'requests.update')
  or private.can_access_department(target_department, 'requests.archive')
  or private.can_access_department(target_department, 'archive.restore')
)
with check (
  (
    assigned_to = auth.uid()
    or private.can_access_department(target_department, 'requests.update')
    or private.can_access_department(target_department, 'requests.archive')
    or private.can_access_department(target_department, 'archive.restore')
  )
  and
  status in ('waiting', 'in_progress', 'done')
  and (
    (archived_at is null and archived_by is null)
    or (
      archived_at is not null
      and status = 'done'
      and archived_by = auth.uid()
    )
  )
);

revoke all on table public.it_requests from anon, authenticated;
grant select, insert on table public.it_requests to authenticated;
grant update (status, archived_at, archived_by)
  on table public.it_requests to authenticated;

alter table public.it_request_messages enable row level security;

drop policy if exists "Authenticated users can read request messages"
  on public.it_request_messages;
drop policy if exists "Request participants can read messages"
  on public.it_request_messages;
create policy "Request participants can read messages"
on public.it_request_messages for select
to authenticated
using (
  exists (
    select 1
    from public.it_requests as request
    where request.id = it_request_messages.request_id
      and (
        request.requester_user_id = auth.uid()
        or request.assigned_to = auth.uid()
        or (
          request.archived_at is null
          and private.can_access_department(
            request.target_department,
            'requests.view'
          )
        )
        or (
          request.archived_at is not null
          and private.can_access_department(
            request.target_department,
            'archive.view'
          )
        )
      )
  )
);

drop policy if exists "Authenticated users can send request messages"
  on public.it_request_messages;
drop policy if exists "Request participants can send messages"
  on public.it_request_messages;
create policy "Request participants can send messages"
on public.it_request_messages for insert
to authenticated
with check (
  auth.uid() = sender_id
  and lower(sender_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  and exists (
    select 1
    from public.it_requests as request
    where request.id = it_request_messages.request_id
      and (
        request.requester_user_id = auth.uid()
        or request.assigned_to = auth.uid()
        or (
          request.archived_at is null
          and private.can_access_department(
            request.target_department,
            'requests.view'
          )
        )
        or (
          request.archived_at is not null
          and private.can_access_department(
            request.target_department,
            'archive.view'
          )
        )
      )
  )
  and (char_length(trim(body)) > 0 or image_path is not null)
  and (
    (
      image_path is null
      and attachment_name is null
      and attachment_mime_type is null
      and attachment_size is null
    )
    or (
      image_path is not null
      and split_part(image_path, '/', 1) = auth.uid()::text
      and attachment_name is not null
      and attachment_mime_type is not null
      and attachment_size is not null
    )
  )
);

revoke all on table public.it_request_messages from anon, authenticated;
grant select, insert on table public.it_request_messages to authenticated;

drop policy if exists "Authenticated users can view IT request images"
  on storage.objects;
drop policy if exists "Request owners and admins can view IT request images"
  on storage.objects;
create policy "Request owners and admins can view IT request images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'it-request-images'
  and private.can_access_request_image(name)
);

drop policy if exists "Authenticated users can upload IT request images"
  on storage.objects;

drop policy if exists "Users can delete their own IT request images"
  on storage.objects;

-- Add the messages table to Supabase Realtime once. The DO block keeps this
-- script safe to rerun without a "table is already member" error.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'it_request_messages'
  ) then
    alter publication supabase_realtime
      add table public.it_request_messages;
  end if;
end
$$;

insert into public.it_requests (
  code, requester_name, requester_email, department, target_department, category,
  priority, subject, detail, status, created_at
)
values
  ('REQ-240819-018', 'ปิยะดา ศรีสุข', 'piyada@company.co.th', 'ฝ่ายขาย', 'ฝ่ายบัญชี',
   'การเงินและบัญชี', 'urgent', 'ขออนุมัติเบิกค่าเดินทางพบลูกค้า',
   'ต้องใช้เอกสารอนุมัติก่อนเดินทางพรุ่งนี้ เวลา 08:00 น.', 'in_progress', now() - interval '25 minutes'),
  ('REQ-240819-017', 'ธนากร วงศ์คำ', 'thanakorn@company.co.th', 'ฝ่ายบัญชี', 'ฝ่าย IT',
   'ระบบและเทคโนโลยี', 'normal', 'เข้าใช้งานโปรแกรมบัญชีไม่ได้',
   'ระบบแจ้งว่ารหัสผ่านหมดอายุ แต่ไม่พบหน้าสำหรับเปลี่ยนรหัสผ่าน', 'waiting', now() - interval '49 minutes'),
  ('REQ-240819-016', 'อรทัย แสงดี', 'orathai@company.co.th', 'ฝ่ายบุคคล', 'ฝ่ายปฏิบัติการ',
   'อาคารและสถานที่', 'normal', 'ขอจัดเตรียมห้องสัมภาษณ์',
   'ต้องการโต๊ะ เก้าอี้ และป้ายหน้าห้องสำหรับวันพรุ่งนี้', 'in_progress', now() - interval '73 minutes'),
  ('REQ-240818-015', 'ณัฐพล มีชัย', 'nattapol@company.co.th', 'ฝ่ายปฏิบัติการ', 'ฝ่ายบัญชี',
   'ขออนุมัติและเอกสาร', 'low', 'ขอสำเนาเอกสารค่าใช้จ่ายประจำเดือน',
   'ต้องการใช้ประกอบรายงานสรุปของฝ่ายปฏิบัติการ', 'done', now() - interval '1 day')
on conflict (code) do nothing;
