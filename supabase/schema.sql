-- Run this entire file in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

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
  status text not null default 'waiting' check (
    status in ('waiting', 'in_progress', 'done')
  ),
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

create index if not exists it_requests_department_idx
  on public.it_requests (department);

create index if not exists it_requests_status_idx
  on public.it_requests (status);

create index if not exists it_requests_created_at_idx
  on public.it_requests (created_at desc);

create table if not exists public.it_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.it_requests(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_email text not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists it_request_messages_request_id_idx
  on public.it_request_messages (request_id, created_at);

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

alter table public.it_requests enable row level security;

drop policy if exists "Anyone can read IT requests" on public.it_requests;
drop policy if exists "Authenticated users can read IT requests" on public.it_requests;
create policy "Authenticated users can read IT requests"
on public.it_requests for select
to authenticated
using (true);

drop policy if exists "Anyone can create a waiting request" on public.it_requests;
drop policy if exists "Authenticated users can create a waiting request" on public.it_requests;
create policy "Authenticated users can create a waiting request"
on public.it_requests for insert
to authenticated
with check (status = 'waiting');

drop policy if exists "Anyone can update request status" on public.it_requests;
drop policy if exists "Authenticated users can update request status" on public.it_requests;
create policy "Authenticated users can update request status"
on public.it_requests for update
to authenticated
using (true)
with check (status in ('waiting', 'in_progress', 'done'));

revoke all on table public.it_requests from anon, authenticated;
grant select, insert on table public.it_requests to authenticated;
grant update (status) on table public.it_requests to authenticated;

alter table public.it_request_messages enable row level security;

drop policy if exists "Authenticated users can read request messages"
  on public.it_request_messages;
create policy "Authenticated users can read request messages"
on public.it_request_messages for select
to authenticated
using (true);

drop policy if exists "Authenticated users can send request messages"
  on public.it_request_messages;
create policy "Authenticated users can send request messages"
on public.it_request_messages for insert
to authenticated
with check (
  auth.uid() = sender_id
  and sender_email = coalesce(auth.jwt() ->> 'email', '')
);

revoke all on table public.it_request_messages from anon, authenticated;
grant select, insert on table public.it_request_messages to authenticated;

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
