-- Per-user and per-team credit pools.

CREATE TABLE IF NOT EXISTS user_credits (
    credit_id                BIGSERIAL PRIMARY KEY,
    user_id                  BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    cycle_credits_remaining  INTEGER      NOT NULL DEFAULT 0,
    cycle_credits_allocated  INTEGER      NOT NULL DEFAULT 0,
    bought_credits_remaining INTEGER      NOT NULL DEFAULT 0,
    total_bought_credits     INTEGER      NOT NULL DEFAULT 0,
    last_cycle_reset_at      TIMESTAMP,
    last_api_usage           TIMESTAMP,
    total_api_calls_made     BIGINT       NOT NULL DEFAULT 0,
    created_at               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version                  BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT uk_user_credits_user_id UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_credits_user_id     ON user_credits (user_id);
CREATE INDEX IF NOT EXISTS idx_user_credits_last_reset  ON user_credits (last_cycle_reset_at);
CREATE INDEX IF NOT EXISTS idx_user_credits_last_usage  ON user_credits (last_api_usage);

CREATE TABLE IF NOT EXISTS team_credits (
    credit_id                BIGSERIAL PRIMARY KEY,
    team_id                  BIGINT       NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
    cycle_credits_remaining  INTEGER      NOT NULL DEFAULT 0,
    cycle_credits_allocated  INTEGER      NOT NULL DEFAULT 0,
    bought_credits_remaining INTEGER      NOT NULL DEFAULT 0,
    total_bought_credits     INTEGER      NOT NULL DEFAULT 0,
    last_cycle_reset_at      TIMESTAMP,
    last_api_usage           TIMESTAMP,
    total_api_calls_made     BIGINT       NOT NULL DEFAULT 0,
    created_at               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version                  BIGINT       NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_team_credits_team_id    ON team_credits (team_id);
CREATE INDEX IF NOT EXISTS idx_team_credits_last_reset ON team_credits (last_cycle_reset_at);
