-- Durable home-team pointer for SaaS users (processor-teams WS1).
--
-- home_team_id is the team a user returns to when they leave a team they joined - distinct
-- from users.team_id, which is their currently-active team. SaaS-only (self-hosted uses the
-- single users.team_id model), so it lives on the saas_user_extensions sidecar rather than the
-- shared users table, keeping OSS/self-hosted schemas free of saas-only columns.
--
-- Nullable; ON DELETE SET NULL so deleting a home team clears the pointer instead of blocking.
-- Populated at signup going forward; existing users are backfilled by a later migration.
-- Idempotent (ADD COLUMN IF NOT EXISTS) to survive the dual Flyway/Supabase application model.

ALTER TABLE stirling_pdf.saas_user_extensions
    ADD COLUMN IF NOT EXISTS home_team_id BIGINT
        REFERENCES stirling_pdf.teams(team_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_saas_user_extensions_home_team
    ON stirling_pdf.saas_user_extensions (home_team_id);
