-- Run this entire file in Supabase Dashboard > SQL Editor.
-- This migration adds the in-app notification center to an existing project.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid references public.it_requests(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null check (
    type in ('request_created', 'status_changed', 'message_received')
  ),
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 500),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "Users can read their own notifications"
  on public.notifications;
create policy "Users can read their own notifications"
on public.notifications for select
to authenticated
using ((select auth.uid()) = user_id);

-- Changes are made through these functions, so users cannot mark another
-- person's notifications as read by sending a direct UPDATE request.
create or replace function public.mark_notification_read(notification_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = notification_id
    and user_id = (select auth.uid());
$$;

create or replace function public.mark_all_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set read_at = now()
  where user_id = (select auth.uid())
    and read_at is null;
$$;

revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;

revoke all on function public.mark_notification_read(uuid) from public;
revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function private.notify_new_it_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (
    user_id,
    request_id,
    actor_id,
    type,
    title,
    body
  )
  select
    profile.id,
    new.id,
    (select auth.uid()),
    'request_created',
    'มีคำขอใหม่ ' || new.code,
    left(new.requester_name || ' · ' || new.subject, 500)
  from public.profiles as profile
  where profile.role = 'admin'
    and profile.id is distinct from new.requester_user_id;

  return new;
end;
$$;

create or replace function private.notify_it_request_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  status_label text;
begin
  if old.status is not distinct from new.status
     or new.requester_user_id is null then
    return new;
  end if;

  status_label := case new.status
    when 'waiting' then 'รอดำเนินการ'
    when 'in_progress' then 'กำลังดำเนินการ'
    when 'done' then 'เสร็จสิ้น'
    else new.status
  end;

  insert into public.notifications (
    user_id,
    request_id,
    actor_id,
    type,
    title,
    body
  )
  values (
    new.requester_user_id,
    new.id,
    (select auth.uid()),
    'status_changed',
    'อัปเดตสถานะ ' || new.code,
    'สถานะเปลี่ยนเป็น “' || status_label || '” · ' || left(new.subject, 400)
  );

  return new;
end;
$$;

create or replace function private.notify_new_it_request_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_code text;
  request_owner_id uuid;
  message_preview text;
  sender_is_admin boolean;
begin
  select request.code, request.requester_user_id
  into request_code, request_owner_id
  from public.it_requests as request
  where request.id = new.request_id;

  if request_code is null then
    return new;
  end if;

  message_preview := case
    when nullif(trim(new.body), '') is not null then left(trim(new.body), 360)
    else 'ส่งรูปภาพในห้องแชต'
  end;

  select exists (
    select 1
    from public.profiles as profile
    where profile.id = new.sender_id
      and profile.role = 'admin'
  ) into sender_is_admin;

  if sender_is_admin then
    if request_owner_id is not null
       and request_owner_id is distinct from new.sender_id then
      insert into public.notifications (
        user_id,
        request_id,
        actor_id,
        type,
        title,
        body
      )
      values (
        request_owner_id,
        new.request_id,
        new.sender_id,
        'message_received',
        'ฝ่าย IT ตอบกลับ ' || request_code,
        message_preview
      );
    end if;
  else
    insert into public.notifications (
      user_id,
      request_id,
      actor_id,
      type,
      title,
      body
    )
    select
      profile.id,
      new.request_id,
      new.sender_id,
      'message_received',
      'ข้อความใหม่ ' || request_code,
      left(new.sender_email || ' · ' || message_preview, 500)
    from public.profiles as profile
    where profile.role = 'admin'
      and profile.id is distinct from new.sender_id;
  end if;

  return new;
end;
$$;

revoke all on function private.notify_new_it_request() from public;
revoke all on function private.notify_it_request_status_changed() from public;
revoke all on function private.notify_new_it_request_message() from public;

drop trigger if exists notify_new_it_request on public.it_requests;
create trigger notify_new_it_request
after insert on public.it_requests
for each row execute function private.notify_new_it_request();

drop trigger if exists notify_it_request_status_changed on public.it_requests;
create trigger notify_it_request_status_changed
after update of status on public.it_requests
for each row execute function private.notify_it_request_status_changed();

drop trigger if exists notify_new_it_request_message
  on public.it_request_messages;
create trigger notify_new_it_request_message
after insert on public.it_request_messages
for each row execute function private.notify_new_it_request_message();

-- Realtime pushes new and read-state changes into the notification center.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime
      add table public.notifications;
  end if;
end
$$;
