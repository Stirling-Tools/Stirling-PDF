-- Classification labels (gated by policies.enabled): the flat multi-label vocabulary the document
-- classifier runs against. One admin-editable row per team. The whole label set lives as JSON in
-- labels_json (authoritative on read). team_id is a natural key and a plain value (not a foreign
-- key) to stay decoupled from the security entities, so classification can be enabled or disabled
-- without touching them; the sentinel 0 holds the unteamed (login-disabled) team set. Hibernate
-- ddl-auto would also create this, but this keeps the schema explicit for Flyway-managed deploys.

CREATE TABLE IF NOT EXISTS classification_labels (
    team_id     BIGINT PRIMARY KEY,
    labels_json TEXT,
    updated_at  TIMESTAMP,
    updated_by  VARCHAR(255)
);
