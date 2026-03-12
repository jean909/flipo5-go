-- Add category, description, brand to products for richer product creation.
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT '';
