-- Persisted, reusable output destinations ("outputs") that policies reference by id, mirroring
-- policy_sources (see V22). The whole output lives as JSON in output_json (authoritative on read);
-- the scalar columns are denormalized copies for querying, notably team_id so a caller's team can
-- be loaded without scanning every team's rows. owner and team_id are plain values, not foreign
-- keys, to stay decoupled from the security entities. Hibernate ddl-auto would also create this,
-- but this keeps the schema explicit for the Flyway-managed deployments.

CREATE TABLE IF NOT EXISTS policy_outputs (
    id          VARCHAR(255) PRIMARY KEY,
    name        VARCHAR(255),
    type        VARCHAR(255),
    owner       VARCHAR(255),
    team_id     BIGINT,
    enabled     BOOLEAN      NOT NULL DEFAULT FALSE,
    output_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_policy_outputs_team ON policy_outputs (team_id);
