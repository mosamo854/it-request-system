-- Run this entire file in Supabase Dashboard > SQL Editor.
-- Adds safe same-department assignment without deleting existing requests.

alter table public.it_requests
  add column if not exists assigned_to uuid;

alter table public.it_requests
  add column if not exists assigned_to_name text;

alter table public.it_requests
  add column if not exists assigned_at timestamptz;

alter table public.it_requests
  add column if not exists assigned_by uuid;

do $$
begin
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
end
$$;

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
    raise exception 'บัญชีนี้ไม่มีสิทธิ์เปลี่ยนสถานะคำขอของแผนกนี้'
      using errcode = '42501';
  end if;

  if old.archived_at is null and new.archived_at is not null
     and not private.can_access_department(
       old.target_department,
       'requests.archive',
       auth.uid()
     ) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์เก็บคำขอของแผนกนี้'
      using errcode = '42501';
  end if;

  if old.archived_at is not null and new.archived_at is null
     and not private.can_access_department(
       old.target_department,
       'archive.restore',
       auth.uid()
     ) then
    raise exception 'บัญชีนี้ไม่มีสิทธิ์กู้คืนคำขอของแผนกนี้'
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

drop policy if exists "Users read own requests and admins read all"
  on public.it_requests;
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

drop policy if exists "Users can create their own waiting request"
  on public.it_requests;
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
    image_path is null
    or split_part(image_path, '/', 1) = auth.uid()::text
  )
);

drop policy if exists "Admins can update and archive requests"
  on public.it_requests;
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
