-- This tells the storage engine to allow your web app to fetch images
insert into storage.buckets (id, name, public, allowed_mime_types, fileSizeLimit)
values ('class-covers', 'class-covers', true, '{image/jpeg,image/png}', 5242880)
on conflict (id) do update set public = true;