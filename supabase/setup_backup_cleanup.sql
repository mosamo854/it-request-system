-- Run this file once in Supabase Dashboard > SQL Editor after:
-- 1) Deploying the purge-backups Edge Function with --no-verify-jwt
-- 2) Setting BACKUP_CLEANUP_SECRET on the Edge Function
--
-- Replace both placeholders below before pressing Run:
--   YOUR_PUBLISHABLE_OR_ANON_KEY
--   YOUR_BACKUP_CLEANUP_SECRET
-- The cleanup secret must be the exact same value used by:
--   npx supabase secrets set BACKUP_CLEANUP_SECRET=...

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
declare
  secret_id uuid;
begin
  select id into secret_id
  from vault.secrets
  where name = 'it_backup_cleanup_project_url';

  if secret_id is null then
    perform vault.create_secret(
      'https://qhdwztrzljhkjmacfrkn.supabase.co',
      'it_backup_cleanup_project_url',
      'Project URL for the IT backup cleanup job'
    );
  else
    perform vault.update_secret(
      secret_id,
      'https://qhdwztrzljhkjmacfrkn.supabase.co',
      'it_backup_cleanup_project_url',
      'Project URL for the IT backup cleanup job'
    );
  end if;

  select id into secret_id
  from vault.secrets
  where name = 'it_backup_cleanup_publishable_key';

  if secret_id is null then
    perform vault.create_secret(
      'YOUR_PUBLISHABLE_OR_ANON_KEY',
      'it_backup_cleanup_publishable_key',
      'Publishable key for the IT backup cleanup job'
    );
  else
    perform vault.update_secret(
      secret_id,
      'YOUR_PUBLISHABLE_OR_ANON_KEY',
      'it_backup_cleanup_publishable_key',
      'Publishable key for the IT backup cleanup job'
    );
  end if;

  select id into secret_id
  from vault.secrets
  where name = 'it_backup_cleanup_secret';

  if secret_id is null then
    perform vault.create_secret(
      'YOUR_BACKUP_CLEANUP_SECRET',
      'it_backup_cleanup_secret',
      'Shared secret for the IT backup cleanup job'
    );
  else
    perform vault.update_secret(
      secret_id,
      'YOUR_BACKUP_CLEANUP_SECRET',
      'it_backup_cleanup_secret',
      'Shared secret for the IT backup cleanup job'
    );
  end if;
end
$$;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'purge-it-request-backups-hourly';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

select cron.schedule(
  'purge-it-request-backups-hourly',
  '5 * * * *',
  $cron$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'it_backup_cleanup_project_url'
      ) || '/functions/v1/purge-backups',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'it_backup_cleanup_publishable_key'
        ),
        'x-cleanup-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'it_backup_cleanup_secret'
        )
      ),
      body := '{"source":"cron"}'::jsonb,
      timeout_milliseconds := 120000
    ) as request_id;
  $cron$
);

-- Verify that the job exists and is active.
select jobid, jobname, schedule, active
from cron.job
where jobname = 'purge-it-request-backups-hourly';
