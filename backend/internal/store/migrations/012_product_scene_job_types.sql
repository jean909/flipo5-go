-- Job types: improve scene prompt, suggest scenes for product.
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_type_check
  CHECK (type IN ('chat', 'image', 'video', 'upscale', 'seo', 'outline', 'translate', 'logo', 'product_analyze', 'product_score', 'product_description', 'product_scene_improve', 'product_suggest_scenes'));
