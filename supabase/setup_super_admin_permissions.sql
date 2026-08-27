-- Run this once after schema.sql when upgrading an existing project.
-- Existing Admin accounts keep their previous full access until a Super Admin
-- changes each account from the web interface.

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

revoke all on function private.is_admin(uuid) from public;
revoke all on function private.is_super_admin(uuid) from public;
revoke all on function private.has_permission(text, uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin(uuid) to authenticated;
grant execute on function private.is_super_admin(uuid) to authenticated;
grant execute on function private.has_permission(text, uuid) to authenticated;

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
     and not private.has_permission('requests.update', auth.uid()) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์เปลี่ยนสถานะคำขอ'
      using errcode = '42501';
  end if;

  if old.archived_at is null and new.archived_at is not null
     and not private.has_permission('requests.archive', auth.uid()) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์เก็บคำขอในคลังสำรอง'
      using errcode = '42501';
  end if;

  if old.archived_at is not null and new.archived_at is null
     and not private.has_permission('archive.restore', auth.uid()) then
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

drop policy if exists "Admins can create departments" on public.departments;
create policy "Admins can create departments"
on public.departments for insert
to authenticated
with check (private.has_permission('departments.create'));

drop policy if exists "Users can read their own profile and admins can read all"
  on public.profiles;
create policy "Users can read their own profile and admins can read all"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or private.has_permission('users.view')
);

drop policy if exists "Users read own requests and admins read all"
  on public.it_requests;
create policy "Users read own requests and admins read all"
on public.it_requests for select
to authenticated
using (
  requester_user_id = auth.uid()
  or (
    archived_at is null
    and private.has_permission('requests.view')
  )
  or (
    archived_at is not null
    and private.has_permission('archive.view')
  )
  or private.has_permission('statistics.view')
);

drop policy if exists "Admins can update and archive requests"
  on public.it_requests;
create policy "Admins can update and archive requests"
on public.it_requests for update
to authenticated
using (
  private.has_permission('requests.update')
  or private.has_permission('requests.archive')
  or private.has_permission('archive.restore')
)
with check (
  (
    private.has_permission('requests.update')
    or private.has_permission('requests.archive')
    or private.has_permission('archive.restore')
  )
  and status in ('waiting', 'in_progress', 'done')
  and (
    (archived_at is null and archived_by is null)
    or (
      archived_at is not null
      and status = 'done'
      and archived_by = auth.uid()
    )
  )
);

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
        or (
          request.archived_at is null
          and private.has_permission('requests.view')
        )
        or (
          request.archived_at is not null
          and private.has_permission('archive.view')
        )
      )
  )
);

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
        or (
          request.archived_at is null
          and private.has_permission('requests.view')
        )
        or (
          request.archived_at is not null
          and private.has_permission('archive.view')
        )
      )
  )
  and (char_length(trim(body)) > 0 or image_path is not null)
  and (
    image_path is null
    or split_part(image_path, '/', 1) = auth.uid()::text
  )
);

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
      or (
        request.archived_at is null
        and private.has_permission('requests.view', check_user_id)
      )
      or (
        request.archived_at is not null
        and private.has_permission('archive.view', check_user_id)
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
