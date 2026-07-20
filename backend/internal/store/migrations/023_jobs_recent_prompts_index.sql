-- Faster ListRecentPrompts: completed jobs by user, newest first
CREATE INDEX IF NOT EXISTS idx_jobs_user_completed_created
  ON jobs (user_id, created_at DESC)
  WHERE status = 'completed';
