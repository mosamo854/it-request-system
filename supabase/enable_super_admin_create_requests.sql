-- Allow regular users and Super Admins to create their own waiting requests.
-- Run this script in Supabase SQL Editor after deploying the frontend update.
-- Admin accounts remain unable to create requests unless they have a separate policy.

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
      and lower(profile.email) = lower(requester_email)
      and (
        (profile.role = 'user' and profile.department = department)
        or profile.role = 'super_admin'
      )
  )
  and (
    (
      image_path is null
      and attachment_name is null
      and attachment_mime_type is null
      and attachment_size is null
    )
    or (
      image_path is not null
      and split_part(image_path, '/', 1) = auth.uid()::text
      and attachment_name is not null
      and attachment_mime_type is not null
      and attachment_size is not null
    )
  )
);
