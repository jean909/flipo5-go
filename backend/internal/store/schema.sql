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
    type TEXT NOT NULL CHECK (type IN ('chat', 'image', 'video', 'upscale')),
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

-- Admin: set first admin with UPDATE users SET is_admin = true WHERE email = 'your@email.com';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = true;

-- Jobs: name = first 4 words of prompt (for image/video indexing)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS name TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_name ON jobs(name);

-- Jobs: user feedback (like/dislike) per response – stocat în DB pentru analiză
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS rating TEXT CHECK (rating IS NULL OR rating IN ('like', 'dislike'));
-- Backfill name for existing image/video jobs
UPDATE jobs SET name = array_to_string(
  (regexp_split_to_array(trim(COALESCE(input->>'prompt','')), E'\\s+'))[1:4],
  ' '
) WHERE type IN ('image','video') AND (name IS NULL OR name = '') AND input->>'prompt' IS NOT NULL AND trim(COALESCE(input->>'prompt','')) != '';

-- Edit Studio: projects (user's editing sessions)
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Untitled',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);

-- Project items: images/videos in a project (source from content or upload)
CREATE TABLE IF NOT EXISTS projects_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('image', 'video')),
    source_url TEXT NOT NULL,
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_items_project ON projects_items(project_id);

-- Project items versions: each edit creates a new version
CREATE TABLE IF NOT EXISTS projects_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES projects_items(id) ON DELETE CASCADE,
    version_num INT NOT NULL,
    url TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_versions_item ON projects_versions(item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_versions_item_num ON projects_versions(item_id, version_num);