-- Migration: Add rendered_photo_url column to projects table
-- Date: 2026-05-15

ALTER TABLE projects ADD COLUMN rendered_photo_url TEXT DEFAULT NULL;

COMMENT ON COLUMN projects.rendered_photo_url IS 'AI-processed/rendered version of the project photo with overlay effects';
