-- Upgrade an existing Request Center project without deleting current data.
-- Old IT-only requests are assigned to ฝ่าย IT as their target department.

insert into public.departments (name)
values ('ฝ่าย IT')
on conflict do nothing;

create or replace function public.generate_request_code()
returns text
language sql
volatile
as $$
  select 'REQ-' || to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD') || '-' ||
         upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

alter table public.it_requests
  add column if not exists target_department text;

update public.it_requests
set target_department = 'ฝ่าย IT'
where target_department is null;

alter table public.it_requests
  alter column target_department set not null;

alter table public.it_requests
  alter column code set default public.generate_request_code();

do $$
begin
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

create index if not exists it_requests_target_department_idx
  on public.it_requests (target_department, created_at desc);

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
grant usage on schema private to authenticated;
grant execute on function private.can_access_department(text, text, uuid)
  to authenticated;

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

drop policy if exists "Admins can update and archive requests"
  on public.it_requests;
create policy "Admins can update and archive requests"
on public.it_requests for update
to authenticated
using (
  private.can_access_department(target_department, 'requests.update')
  or private.can_access_department(target_department, 'requests.archive')
  or private.can_access_department(target_department, 'archive.restore')
)
with check (
  (
    private.can_access_department(target_department, 'requests.update')
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
