-- Lock down the public "images" bucket.
-- Reads keep working through the public bucket URL (no SELECT policy needed).
-- Only signed-in members of a business may upload; nobody may replace, delete
-- or list objects through the API (the server uses the service role).
drop policy if exists "Allow all operations on images bucket" on storage.objects;

create policy "Business members can upload images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'images'
    and exists (
      select 1 from public.user_businesses ub where ub.user_id = (select auth.uid())
    )
  );

update storage.buckets
  set file_size_limit = 26214400,
      allowed_mime_types = array['image/*', 'video/mp4']
  where id = 'images';
