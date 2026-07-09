-- Account-link instances. One row per self-hosted instance that has linked a SaaS account.
--
-- Part of the combined-billing "Mode A" (connected self-hosted) flow:
--   1. An admin signs into their SaaS account in the Stirling Portal via the Supabase JS SDK
--      (a short-lived Supabase JWT, refreshed client-side — it never reaches the server long-term).
--   2. That JWT is used ONCE to call POST /api/v1/account-link/register, which mints a
--      device_id + device_secret bound to the admin's team. The secret is returned once and
--      stored only on the instance; we keep a SHA-256 hash here (the secret is high-entropy,
--      so an unsalted hash is sufficient — same posture as API keys).
--   3. The instance authenticates all unattended metering / entitlement calls with that device
--      credential. No long-lived user JWT lives on the server side.
--
-- Twin of supabase/migrations/20260619000000_account_link_instances.sql (Stirling-PDF-SaaS).
-- Inert until release: the AccountLinkController + device-credential filter are gated behind
-- stirling.billing.account-link.enabled (default off). The table itself is harmless additive.

CREATE TABLE IF NOT EXISTS stirling_pdf.linked_instance (
    instance_id        BIGSERIAL    PRIMARY KEY,
    team_id            BIGINT       NOT NULL REFERENCES stirling_pdf.teams(team_id) ON DELETE CASCADE,
    created_by_user_id BIGINT,
    -- admin who registered the instance; informational only (no FK so a user delete never
    -- cascades a working instance offline).
    device_id          VARCHAR(64)  NOT NULL UNIQUE,
    -- public, non-secret identifier the instance presents on every request.
    device_secret_hash VARCHAR(64)  NOT NULL,
    -- SHA-256 hex of the device secret; the secret itself is never stored.
    name               VARCHAR(255),
    -- operator-set display label (hostname etc.) for the "Linked instances" list.
    created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at       TIMESTAMP,
    -- stamped when the device credential last authenticated; powers staleness display.
    revoked_at         TIMESTAMP
    -- NULL = active. Set on unlink/revoke; a revoked credential fails authentication.
);

CREATE INDEX IF NOT EXISTS idx_linked_instance_team
    ON stirling_pdf.linked_instance (team_id);

COMMENT ON TABLE stirling_pdf.linked_instance IS
    'One row per self-hosted instance linked to a SaaS account (combined-billing Mode A). '
    'device_id is the public identifier; device_secret_hash is the SHA-256 of the bearer '
    'secret (returned once at registration, stored only on the instance). The instance '
    'authenticates unattended metering / entitlement calls with this credential; revoked_at '
    'IS NULL means active.';
