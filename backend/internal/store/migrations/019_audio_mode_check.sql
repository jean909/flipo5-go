-- Enforce audio mode persistence for audio jobs.
-- We store it in jobs.input->'audio_mode' so each generation is auditable as music/vocal.

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
