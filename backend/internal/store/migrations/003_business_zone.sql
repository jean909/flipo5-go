-- Business Zone: user files (text content: SEO articles, etc.)
CREATE TABLE IF NOT EXISTS user_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    file_type TEXT NOT NULL DEFAULT 'text' CHECK (file_type IN ('seo', 'text')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_files_user_id ON user_files(user_id);
CREATE INDEX IF NOT EXISTS idx_user_files_created_at ON user_files(created_at DESC);

-- Allow 'seo' + 'outline' job types
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_type_check CHECK (type IN ('chat', 'image', 'video', 'upscale', 'seo', 'outline'));

-- Allow renaming files
ALTER TABLE user_files ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
