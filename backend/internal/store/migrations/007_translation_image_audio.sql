-- Allow image and audio source types for translations (Gemini supports images + audio).
ALTER TABLE translation_items DROP CONSTRAINT IF EXISTS translation_items_source_type_check;
ALTER TABLE translation_items ADD CONSTRAINT translation_items_source_type_check
  CHECK (source_type IN ('url', 'text', 'image', 'audio'));
