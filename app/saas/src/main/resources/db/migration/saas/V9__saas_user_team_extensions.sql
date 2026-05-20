-- Saas-only sidecar tables for user and team metadata.

CREATE TABLE IF NOT EXISTS saas_user_extensions (
    user_id                      BIGINT      PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    has_metered_billing_enabled  BOOLEAN     NOT NULL DEFAULT FALSE,
    api_key_first_used_at        TIMESTAMP,
    created_at                   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saas_user_extensions_metered_billing
    ON saas_user_extensions (has_metered_billing_enabled);

CREATE TABLE IF NOT EXISTS saas_team_extensions (
    team_id              BIGINT      PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
    team_type            VARCHAR(32) NOT NULL DEFAULT 'STANDARD',
    is_personal          BOOLEAN     NOT NULL DEFAULT FALSE,
    seat_count           INTEGER     NOT NULL DEFAULT 1,
    seats_used           INTEGER     NOT NULL DEFAULT 0,
    max_seats            INTEGER     NOT NULL DEFAULT 1,
    created_by_user_id   BIGINT,
    created_at           TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version              BIGINT      NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_saas_team_extensions_is_personal
    ON saas_team_extensions (is_personal);
CREATE INDEX IF NOT EXISTS idx_saas_team_extensions_created_by_user_id
    ON saas_team_extensions (created_by_user_id);

-- Backfill from any pre-existing columns on users / teams, then drop them.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'has_metered_billing_enabled'
    ) THEN
        INSERT INTO saas_user_extensions (user_id, has_metered_billing_enabled, api_key_first_used_at)
        SELECT user_id, COALESCE(has_metered_billing_enabled, FALSE), api_key_first_used_at
        FROM users
        ON CONFLICT (user_id) DO NOTHING;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'teams'
          AND column_name = 'team_type'
    ) THEN
        INSERT INTO saas_team_extensions (
            team_id, team_type, is_personal, seat_count, seats_used, max_seats, created_by_user_id
        )
        SELECT id,
               COALESCE(team_type, 'STANDARD'),
               COALESCE(is_personal, FALSE),
               COALESCE(seat_count, 1),
               COALESCE(seats_used, 0),
               COALESCE(max_seats, 1),
               created_by_user_id
        FROM teams
        ON CONFLICT (team_id) DO NOTHING;

        ALTER TABLE teams DROP COLUMN IF EXISTS team_type;
        ALTER TABLE teams DROP COLUMN IF EXISTS is_personal;
        ALTER TABLE teams DROP COLUMN IF EXISTS seat_count;
        ALTER TABLE teams DROP COLUMN IF EXISTS seats_used;
        ALTER TABLE teams DROP COLUMN IF EXISTS max_seats;
        ALTER TABLE teams DROP COLUMN IF EXISTS created_by_user_id;
    END IF;

    ALTER TABLE users DROP COLUMN IF EXISTS has_metered_billing_enabled;
    ALTER TABLE users DROP COLUMN IF EXISTS api_key_first_used_at;
END
$$;
