-- Add FTE (Full-Time Equivalent) column to effort_allocations
-- FTE = effort_hours / (working_days_per_month * hours_per_day * utilization_pct/100)
-- Default: 20 * 8 * 0.8 = 128 hours per FTE-month
ALTER TABLE effort_allocations
ADD COLUMN IF NOT EXISTS fte NUMERIC(10, 4) NULL;

-- Backfill existing rows: fte = effort_hours / 128
UPDATE effort_allocations
SET fte = ROUND((effort_hours / 128.0)::numeric, 4)
WHERE fte IS NULL AND effort_hours > 0;

-- Set default for future inserts (will be computed from effort_hours if not provided)
COMMENT ON COLUMN effort_allocations.fte IS 'Full-Time Equivalent: effort_hours / (20*8*0.8) = effort_hours/128';
