-- Allow 'upscale' job type in jobs table (for existing DBs created before this change).
-- New installs use schema.sql which already includes 'upscale'.
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_type_check CHECK (type IN ('chat', 'image', 'video', 'upscale'));
