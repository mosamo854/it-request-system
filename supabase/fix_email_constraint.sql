-- Use this short repair script if an older schema.sql failed with:
-- violates check constraint "it_requests_requester_email_check"

alter table public.it_requests
  drop constraint if exists it_requests_requester_email_check;

alter table public.it_requests
  add constraint it_requests_requester_email_check
  check (
    requester_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$'
  );

-- Verify the fixed constraint with the email from the sample data.
select 'piyada@company.co.th' ~*
       '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$'
       as email_is_valid;
