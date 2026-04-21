-- Chat projects: container for related conversations + system instructions + reference files.
-- Inspired by Grok's Projects: each project pre-pends instructions to the system prompt
-- and exposes uploaded files as context references for every chat in that project.

CREATE TABLE IF NOT EXISTS chat_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    instructions TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_projects_user_id ON chat_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_projects_updated_at ON chat_projects(updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_project_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES chat_projects(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT '',
    size_bytes BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_project_files_project ON chat_project_files(project_id);

ALTER TABLE threads ADD COLUMN IF NOT EXISTS chat_project_id UUID REFERENCES chat_projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_threads_chat_project_id ON threads(chat_project_id) WHERE chat_project_id IS NOT NULL;
