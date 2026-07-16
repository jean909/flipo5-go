ALTER TABLE chat_project_files ADD COLUMN IF NOT EXISTS extracted_text TEXT;
ALTER TABLE chat_project_files ADD COLUMN IF NOT EXISTS summary TEXT;
