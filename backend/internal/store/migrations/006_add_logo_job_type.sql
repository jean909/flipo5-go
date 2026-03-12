-- Logo Creator tool: job type for nano-banana logo generation
UPDATE jobs SET type = 'chat' WHERE type IS NULL OR type NOT IN ('chat', 'image', 'video', 'upscale', 'seo', 'outline', 'translate', 'logo');
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_type_check CHECK (type IN ('chat', 'image', 'video', 'upscale', 'seo', 'outline', 'translate', 'logo'));
