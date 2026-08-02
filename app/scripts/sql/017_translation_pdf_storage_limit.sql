-- Align the private translation PDF bucket with the application upload limit.
-- This does not change application tables or translation document structure.

update storage.buckets
set
  file_size_limit = 62914560,
  allowed_mime_types = array['application/pdf']
where id = 'project-stage-translations';
