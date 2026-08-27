-- Compatibility alias: this now creates the first Super Admin.
-- Run setup_super_admin_permissions.sql first, then replace the email below.

update public.profiles
set role = 'super_admin',
    permissions = '{}'::text[],
    department = 'ฝ่าย IT',
    updated_at = now()
where lower(email) = lower('YOUR_IT_ADMIN_EMAIL@company.co.th');

-- Confirm the result. The selected row must show role = super_admin.
select id, email, full_name, department, role, permissions
from public.profiles
order by created_at;
