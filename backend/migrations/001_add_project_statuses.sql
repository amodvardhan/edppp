-- Migration: Add new project statuses (review, submitted, won)
-- Run this against your PostgreSQL database before deploying the new code.
-- Usage: psql -d your_database -f 001_add_project_statuses.sql
--
-- Note: If values already exist, you may see "already exists" errors - that's OK.
-- If "type projectstatus does not exist", check enum name: SELECT typname FROM pg_type WHERE typtype = 'e';

-- Add new enum values
ALTER TYPE projectstatus ADD VALUE IF NOT EXISTS 'review';
ALTER TYPE projectstatus ADD VALUE IF NOT EXISTS 'submitted';
ALTER TYPE projectstatus ADD VALUE IF NOT EXISTS 'won';

-- Migrate existing 'locked' rows to 'won' (only if 'locked' exists in the enum)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'projectstatus' AND e.enumlabel = 'locked'
  ) THEN
    UPDATE project_versions SET status = 'won'::projectstatus WHERE status::text = 'locked';
  END IF;
END
$$;
