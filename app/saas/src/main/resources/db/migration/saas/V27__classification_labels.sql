-- Classification labels (gated by policies.enabled): the flat multi-label vocabulary the document
-- classifier runs against. Two scopes: one admin-editable row per team, plus one additive personal
-- row per user. The whole label set lives as JSON in labels_json (authoritative on read). team_id
-- and user_id are natural keys and plain values (not foreign keys) to stay decoupled from the
-- security entities, so classification can be enabled or disabled without touching them; the
-- sentinel 0 holds the unteamed (login-disabled) team set. Hibernate ddl-auto would also create
-- these, but this keeps the schema explicit for the Flyway-managed deployments.

CREATE TABLE IF NOT EXISTS classification_labels (
    team_id     BIGINT PRIMARY KEY,
    labels_json TEXT,
    updated_at  TIMESTAMP,
    updated_by  VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS classification_user_labels (
    user_id     BIGINT PRIMARY KEY,
    labels_json TEXT,
    updated_at  TIMESTAMP
);
