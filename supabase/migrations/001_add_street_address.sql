-- Migration: Add street_address column to users table
-- Date: 2026-04-24

ALTER TABLE users ADD COLUMN street_address TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN users.street_address IS 'Homeowner street address for service location';
