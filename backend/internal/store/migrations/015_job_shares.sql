-- Signed share links with DB-backed TTL + revocation.
CREATE TABLE IF NOT EXISTS job_shares (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_shares_user_created ON job_shares(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_shares_job ON job_shares(job_id);
