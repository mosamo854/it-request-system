-- Run schema.sql first, then replace the email below with the IT admin account.
-- This command promotes only that account to admin and sets its department.

update public.profiles
set role = 'admin',
    department = 'ฝ่าย IT',
    updated_at = now()
where lower(email) = lower('YOUR_IT_ADMIN_EMAIL@company.co.th');

-- Confirm the result. The selected row must show role = admin.
select id, email, full_name, department, role
from public.profiles
order by created_at;
