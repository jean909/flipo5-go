-- Audio Creation tool: add audio job type
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
