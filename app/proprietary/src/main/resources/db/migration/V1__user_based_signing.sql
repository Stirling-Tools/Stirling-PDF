-- Migration: Convert shared signing from email-based to user-based participants
-- Date: 2025-12-03
-- Description: Add User FK to signing_participants, signature appearance fields,
--              and create user_server_certificates table

-- ===========================================================================
-- PART 1: Add new columns to signing_participants table
-- ===========================================================================

-- Add user_id FK column (nullable initially for migration)
ALTER TABLE signing_participants ADD COLUMN IF NOT EXISTS user_id BIGINT;

-- Make existing email field nullable (keep for audit trail)
ALTER TABLE signing_participants ALTER COLUMN email DROP NOT NULL;

-- Make share_token nullable (deprecating this field)
ALTER TABLE signing_participants ALTER COLUMN share_token DROP NOT NULL;

-- Add signature appearance columns (owner-controlled)
ALTER TABLE signing_participants ADD COLUMN IF NOT EXISTS show_signature BOOLEAN;
ALTER TABLE signing_participants ADD COLUMN IF NOT EXISTS page_number INTEGER;
ALTER TABLE signing_participants ADD COLUMN IF NOT EXISTS reason VARCHAR(255);
ALTER TABLE signing_participants ADD COLUMN IF NOT EXISTS location VARCHAR(255);
ALTER TABLE signing_participants ADD COLUMN IF NOT EXISTS show_logo BOOLEAN;

-- ===========================================================================
-- PART 2: Migrate existing data
-- ===========================================================================

-- Match existing participants to users based on email = username
-- NOTE: This assumes participants were created with email matching username
UPDATE signing_participants sp
SET user_id = u.user_id
FROM users u
WHERE sp.email = u.username
AND sp.user_id IS NULL;

-- ===========================================================================
-- PART 3: Add constraints
-- ===========================================================================

-- Add Foreign Key constraint to User table
ALTER TABLE signing_participants
ADD CONSTRAINT fk_participant_user
FOREIGN KEY (user_id) REFERENCES users(user_id)
ON DELETE CASCADE;

-- Make user_id non-nullable after migration
ALTER TABLE signing_participants ALTER COLUMN user_id SET NOT NULL;

-- ===========================================================================
-- PART 4: Create user_server_certificates table
-- ===========================================================================

CREATE TABLE IF NOT EXISTS user_server_certificates (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE,
    keystore_data BYTEA NOT NULL,
    keystore_password VARCHAR(255) NOT NULL,
    certificate_type VARCHAR(50) NOT NULL,
    subject_dn VARCHAR(500),
    issuer_dn VARCHAR(500),
    valid_from TIMESTAMP,
    valid_to TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_cert_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_cert_user_id ON user_server_certificates(user_id);

-- ===========================================================================
-- VERIFICATION QUERIES (Run these to verify migration)
-- ===========================================================================

-- Check participants without user mapping
-- SELECT * FROM signing_participants WHERE user_id IS NULL;

-- Check new table structure
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'signing_participants'
-- ORDER BY ordinal_position;

-- Check user certificates table
-- SELECT * FROM user_server_certificates;
