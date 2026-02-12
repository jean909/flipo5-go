-- Users (id from Supabase Auth, extra fields for onboarding later)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    where_heard TEXT,
    use_case TEXT,
    plan TEXT,
    api_key_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: add new columns if table already existed (run once)
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS where_heard TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS use_case TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Jobs: chat, image, video
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('chat', 'image', 'video')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    input JSONB,
    output JSONB,
    error TEXT,
    cost_cents INT DEFAULT 0,
    replicate_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);

-- Optional: cost tracking per user
CREATE TABLE IF NOT EXISTS cost_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    job_id UUID REFERENCES jobs(id),
    amount_cents INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_ledger_user ON cost_ledger(user_id);

-- Chat sessions (threads). title = date initially, worker can set summary later.
CREATE TABLE IF NOT EXISTS threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_threads_user_id ON threads(user_id);
CREATE INDEX IF NOT EXISTS idx_threads_updated_at ON threads(updated_at DESC);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES threads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_thread_id ON jobs(thread_id);
CREATE INDEX IF NOT EXISTS idx_jobs_thread_user ON jobs(thread_id, user_id) WHERE thread_id IS NOT NULL;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS ephemeral BOOLEAN DEFAULT false;

-- User settings: data retention, AI configuration (style, primary language, user details)
ALTER TABLE users ADD COLUMN IF NOT EXISTS data_retention_accepted BOOLEAN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_configuration JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_config_updated_at TIMESTAMPTZ;

-- Jobs: name = first 4 words of prompt (for image/video indexing)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS name TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_name ON jobs(name);
-- Backfill name for existing image/video jobs
UPDATE jobs SET name = array_to_string(
  (regexp_split_to_array(trim(COALESCE(input->>'prompt','')), E'\\s+'))[1:4],
  ' '
) WHERE type IN ('image','video') AND (name IS NULL OR name = '') AND input->>'prompt' IS NOT NULL AND trim(COALESCE(input->>'prompt','')) != '';