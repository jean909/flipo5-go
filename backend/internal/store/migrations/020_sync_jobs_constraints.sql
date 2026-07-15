-- Repair jobs_type_check / jobs_audio_mode_check on DBs where constraints drifted or migrations re-ran partially.

UPDATE jobs
SET type = 'chat'
WHERE type IS NULL
   OR type NOT IN (
     'chat', 'image', 'video', 'upscale', 'seo', 'outline', 'translate', 'logo',
     'product_analyze', 'product_score', 'product_description', 'product_scene_improve',
     'product_suggest_scenes', 'audio'
   );

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_type_check
CHECK (
  type IN (
    'chat', 'image', 'video', 'upscale', 'seo', 'outline', 'translate', 'logo',
    'product_analyze', 'product_score', 'product_description', 'product_scene_improve',
    'product_suggest_scenes', 'audio'
  )
);

UPDATE jobs
SET input = jsonb_set(
  CASE
    WHEN input IS NULL OR jsonb_typeof(input) <> 'object' THEN '{}'::jsonb
    ELSE input
  END,
  '{audio_mode}',
  '"music"'::jsonb,
  true
)
WHERE type = 'audio'
  AND (
    input IS NULL
    OR NOT (input ? 'audio_mode')
    OR (input->>'audio_mode') NOT IN ('music', 'vocal')
  );

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_audio_mode_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_audio_mode_check
CHECK (
  type <> 'audio'
  OR (
    input IS NOT NULL
    AND input ? 'audio_mode'
    AND (input->>'audio_mode') IN ('music', 'vocal')
  )
);
