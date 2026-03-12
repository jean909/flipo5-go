-- User learning profile: job type counts, last used, preferred languages/categories (aggregated, no PII).
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    stats JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_at ON user_profiles(updated_at);

COMMENT ON TABLE user_profiles IS 'Aggregated user behavior: job_counts, last_used by type, translate_targets, product_categories';
