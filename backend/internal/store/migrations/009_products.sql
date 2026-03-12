-- Products: user-defined products with photos for Product Pictures (wizard).
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);

CREATE TABLE IF NOT EXISTS product_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    score NUMERIC(3,1) CHECK (score IS NULL OR (score >= 0 AND score <= 10)),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_photos_product_id ON product_photos(product_id);

-- Job type for product photo scoring (AI gives 1-10 per photo).
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_type_check
  CHECK (type IN ('chat', 'image', 'video', 'upscale', 'seo', 'outline', 'translate', 'logo', 'product_analyze', 'product_score'));
