alter table public.projects
add column if not exists rendered_photo_url text;

comment on column public.projects.rendered_photo_url is 'Public URL of AI-rendered selected-tier project photo stored in Supabase Storage (project-photos bucket).';