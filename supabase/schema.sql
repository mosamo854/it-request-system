-- Run this entire file in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null check (char_length(full_name) between 2 and 120),
  department text check (
    department is null
    or department in (
      'ฝ่าย IT', 'ฝ่ายขาย', 'ฝ่ายบุคคล', 'ฝ่ายบัญชี', 'ฝ่ายปฏิบัติการ'
    )
  ),
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

  insert into public.profiles (id, email, full_name, department, role)
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
insert into public.profiles (id, email, full_name, department, role, created_at)
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
      and role = 'admin'
  );
$$;

revoke all on function private.is_admin(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin(uuid) to authenticated;

create or replace function public.generate_it_request_code()
returns text
language sql
volatile
as $$
  select 'IT-' || to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD') || '-' ||
         upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

create table if not exists public.it_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.generate_it_request_code(),
  requester_user_id uuid references auth.users(id) on delete set null,
  requester_name text not null check (char_length(requester_name) between 2 and 120),
  requester_email text not null,
  department text not null check (
    department in ('ฝ่ายขาย', 'ฝ่ายบุคคล', 'ฝ่ายบัญชี', 'ฝ่ายปฏิบัติการ')
  ),
  category text not null,
  priority text not null default 'normal' check (
    priority in ('urgent', 'normal', 'low')
  ),
  subject text not null check (char_length(subject) between 3 and 120),
  detail text not null check (char_length(detail) between 3 and 3000),
  image_path text,
  status text not null default 'waiting' check (
    status in ('waiting', 'in_progress', 'done')
  ),
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
  add column if not exists requester_user_id uuid;

alter table public.it_requests
  add column if not exists archived_at timestamptz;

alter table public.it_requests
  add column if not exists archived_by uuid;

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
    where conname = 'it_requests_archived_by_fkey'
      and conrelid = 'public.it_requests'::regclass
  ) then
    alter table public.it_requests
      add constraint it_requests_archived_by_fkey
      foreign key (archived_by) references auth.users(id) on delete set null;
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

create index if not exists it_requests_status_idx
  on public.it_requests (status);

create index if not exists it_requests_created_at_idx
  on public.it_requests (created_at desc);

create index if not exists it_requests_archived_at_idx
  on public.it_requests (archived_at desc)
  where archived_at is not null;

create index if not exists it_requests_requester_user_id_idx
  on public.it_requests (requester_user_id, created_at desc);

create table if not exists public.it_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.it_requests(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_email text not null,
  body text not null default '',
  image_path text,
  created_at timestamptz not null default now()
);

-- Upgrade message tables created by an older version so image-only messages
-- are valid while keeping text messages limited to 2,000 characters.
alter table public.it_request_messages
  add column if not exists image_path text;

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
      or exists (
        select 1
        from public.profiles as profile
        where profile.id = check_user_id
          and profile.role = 'admin'
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
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
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

alter table public.it_requests enable row level security;

alter table public.profiles enable row level security;

drop policy if exists "Users can read their own profile and admins can read all"
  on public.profiles;
create policy "Users can read their own profile and admins can read all"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or private.is_admin()
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
  or private.is_admin()
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
    image_path is null
    or split_part(image_path, '/', 1) = auth.uid()::text
  )
);

drop policy if exists "Anyone can update request status" on public.it_requests;
drop policy if exists "Authenticated users can update request status" on public.it_requests;
drop policy if exists "Admins can update and archive requests" on public.it_requests;
create policy "Admins can update and archive requests"
on public.it_requests for update
to authenticated
using (private.is_admin())
with check (
  private.is_admin()
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
        or private.is_admin()
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
        or private.is_admin()
      )
  )
  and (char_length(trim(body)) > 0 or image_path is not null)
  and (
    image_path is null
    or split_part(image_path, '/', 1) = auth.uid()::text
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
create policy "Authenticated users can upload IT request images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'it-request-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own IT request images"
  on storage.objects;
create policy "Users can delete their own IT request images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'it-request-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

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
  code, requester_name, requester_email, department, category,
  priority, subject, detail, status, created_at
)
values
  ('IT-240819-018', 'ปิยะดา ศรีสุข', 'piyada@company.co.th', 'ฝ่ายขาย',
   'คอมพิวเตอร์และอุปกรณ์', 'urgent', 'โน้ตบุ๊กเปิดไม่ติดก่อนประชุมลูกค้า',
   'กดปุ่มเปิดแล้วไฟสถานะไม่ขึ้น ต้องใช้เครื่องตอน 13:00 น.', 'in_progress', now() - interval '25 minutes'),
  ('IT-240819-017', 'ธนากร วงศ์คำ', 'thanakorn@company.co.th', 'ฝ่ายบัญชี',
   'โปรแกรมและระบบ', 'normal', 'เข้าใช้งานโปรแกรมบัญชีไม่ได้',
   'ระบบแจ้งว่ารหัสผ่านหมดอายุ แต่ไม่พบหน้าสำหรับเปลี่ยนรหัสผ่าน', 'waiting', now() - interval '49 minutes'),
  ('IT-240819-016', 'อรทัย แสงดี', 'orathai@company.co.th', 'ฝ่ายบุคคล',
   'อินเทอร์เน็ตและเครือข่าย', 'normal', 'Wi-Fi ห้องสัมภาษณ์หลุดบ่อย',
   'สัญญาณหลุดทุก 5–10 นาที กระทบการสัมภาษณ์ออนไลน์', 'in_progress', now() - interval '73 minutes'),
  ('IT-240818-015', 'ณัฐพล มีชัย', 'nattapol@company.co.th', 'ฝ่ายปฏิบัติการ',
   'เครื่องพิมพ์', 'low', 'เครื่องพิมพ์คลังสินค้าพิมพ์สีจาง',
   'หมึกสีดำเริ่มจาง แต่ยังพิมพ์เอกสารได้ตามปกติ', 'done', now() - interval '1 day')
on conflict (code) do nothing;
