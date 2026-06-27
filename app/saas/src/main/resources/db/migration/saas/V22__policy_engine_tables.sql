-- Policy engine schema (gated by policies.enabled): persisted policies and the reusable input
-- connections ("sources") they reference by id. The whole policy/source lives as JSON in the
-- *_json column (authoritative on read); the scalar columns are denormalized copies for querying,
-- notably team_id so a caller's team can be loaded without scanning every team's rows. owner and
-- team_id are plain values, not foreign keys, to stay decoupled from the security entities (so this
-- subsystem can be enabled or disabled without touching them). Hibernate ddl-auto would also create
-- these, but this keeps the schema explicit for the Flyway-managed deployments.

CREATE TABLE IF NOT EXISTS policies (
    id           VARCHAR(255) PRIMARY KEY,
    name         VARCHAR(255),
    owner        VARCHAR(255),
    enabled      BOOLEAN      NOT NULL DEFAULT FALSE,
    trigger_type VARCHAR(255),
    team_id      BIGINT,
    policy_json  TEXT
);

-- For deployments where Hibernate already created policies before this migration (pre-team_id).
ALTER TABLE policies ADD COLUMN IF NOT EXISTS team_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_policies_team         ON policies (team_id);
CREATE INDEX IF NOT EXISTS idx_policies_trigger      ON policies (trigger_type, enabled);

CREATE TABLE IF NOT EXISTS policy_sources (
    id          VARCHAR(255) PRIMARY KEY,
    name        VARCHAR(255),
    type        VARCHAR(255),
    owner       VARCHAR(255),
    team_id     BIGINT,
    enabled     BOOLEAN      NOT NULL DEFAULT FALSE,
    source_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_policy_sources_team ON policy_sources (team_id);
