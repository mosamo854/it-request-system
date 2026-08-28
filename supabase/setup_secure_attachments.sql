-- Run this entire file in Supabase Dashboard > SQL Editor.
-- Adds document metadata and forces every new upload through upload-attachment.

alter table public.it_requests
  add column if not exists attachment_name text;

alter table public.it_requests
  add column if not exists attachment_mime_type text;

alter table public.it_requests
  add column if not exists attachment_size integer;

alter table public.it_requests
  drop constraint if exists it_requests_attachment_name_check;

alter table public.it_requests
  add constraint it_requests_attachment_name_check
  check (
    attachment_name is null
    or char_length(attachment_name) between 1 and 255
  );

alter table public.it_requests
  drop constraint if exists it_requests_attachment_mime_type_check;

alter table public.it_requests
  add constraint it_requests_attachment_mime_type_check
  check (
    attachment_mime_type is null
    or char_length(attachment_mime_type) between 1 and 150
  );

alter table public.it_requests
  drop constraint if exists it_requests_attachment_size_check;

alter table public.it_requests
  add constraint it_requests_attachment_size_check
  check (
    attachment_size is null
    or attachment_size between 1 and 10485760
  );

alter table public.it_request_messages
  add column if not exists attachment_name text;

alter table public.it_request_messages
  add column if not exists attachment_mime_type text;

alter table public.it_request_messages
  add column if not exists attachment_size integer;

alter table public.it_request_messages
  drop constraint if exists it_request_messages_attachment_name_check;

alter table public.it_request_messages
  add constraint it_request_messages_attachment_name_check
  check (
    attachment_name is null
    or char_length(attachment_name) between 1 and 255
  );

alter table public.it_request_messages
  drop constraint if exists it_request_messages_attachment_mime_type_check;

alter table public.it_request_messages
  add constraint it_request_messages_attachment_mime_type_check
  check (
    attachment_mime_type is null
    or char_length(attachment_mime_type) between 1 and 150
  );

alter table public.it_request_messages
  drop constraint if exists it_request_messages_attachment_size_check;

alter table public.it_request_messages
  add constraint it_request_messages_attachment_size_check
  check (
    attachment_size is null
    or attachment_size between 1 and 10485760
  );

update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'text/markdown',
      'application/json'
    ]
where id = 'it-request-images';

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

-- Authenticated clients may read signed files, but cannot bypass the scanner
-- by uploading or deleting directly through the Storage API.
drop policy if exists "Authenticated users can upload IT request images"
  on storage.objects;

drop policy if exists "Users can delete their own IT request images"
  on storage.objects;
