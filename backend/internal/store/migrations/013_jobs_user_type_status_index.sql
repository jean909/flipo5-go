-- Composite index for list/filter by user + type + status (ListContentJobs, ListJobsByProductID, GetLatestProductScoreScenes).
CREATE INDEX IF NOT EXISTS idx_jobs_user_type_status ON jobs(user_id, type, status);
