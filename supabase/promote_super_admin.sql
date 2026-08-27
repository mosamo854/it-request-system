-- Run setup_super_admin_permissions.sql first.
-- Replace the placeholder with the email of the one trusted owner account.

update public.profiles
set role = 'super_admin',
    permissions = '{}'::text[],
    updated_at = now()
where lower(email) = lower('YOUR_SUPER_ADMIN_EMAIL@company.co.th');

-- Exactly the intended owner account should show role = super_admin.
select id, email, full_name, department, role, permissions
from public.profiles
order by created_at;
