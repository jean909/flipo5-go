-- Translation projects: user can create a project and add multiple items to translate, then continue later.
CREATE TABLE IF NOT EXISTS translation_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    source_lang TEXT NOT NULL DEFAULT 'auto',
    target_lang TEXT NOT NULL DEFAULT 'English',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_translation_projects_user_id ON translation_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_translation_projects_updated_at ON translation_projects(updated_at DESC);

CREATE TABLE IF NOT EXISTS translation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES translation_projects(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('url', 'text')),
    source_value TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    result_text TEXT,
    error_message TEXT,
    job_id UUID REFERENCES jobs(id),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_translation_items_project_id ON translation_items(project_id);
CREATE INDEX IF NOT EXISTS idx_translation_items_status ON translation_items(project_id, status);
