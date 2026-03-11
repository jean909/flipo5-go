-- Allow 'cancelled' job status (for user-initiated cancel and stale job cleanup).
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'));
