-- Named, multi-key personal API keys, plus per-key daily usage.
-- Idempotent: Hibernate ddl-auto=update may already have created these on some deployments.

CREATE TABLE IF NOT EXISTS api_keys (
    id            BIGSERIAL    PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    key_hash      VARCHAR(64)  NOT NULL,
    prefix        VARCHAR(32)  NOT NULL,
    owner_user_id BIGINT       NOT NULL,
    enabled       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL,
    last_used_at  TIMESTAMPTZ,
    revoked_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_key_hash ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_key_owner ON api_keys (owner_user_id);

CREATE TABLE IF NOT EXISTS api_key_daily_usage (
    api_key_id BIGINT NOT NULL,
    epoch_day  BIGINT NOT NULL,
    count      BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (api_key_id, epoch_day)
);
