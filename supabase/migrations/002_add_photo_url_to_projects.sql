-- Migration: Add photo_url column to projects table
-- Date: 2026-04-26

ALTER TABLE projects ADD COLUMN photo_url TEXT DEFAULT NULL;

COMMENT ON COLUMN projects.photo_url IS 'Public URL of homeowner-uploaded project photo stored in Supabase Storage (project-photos bucket)';
