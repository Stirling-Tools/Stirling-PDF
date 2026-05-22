-- SaaS-only column additions on top of the OSS users schema. Idempotent.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uk_users_email ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS uk_users_supabase_id ON users (supabase_id);
