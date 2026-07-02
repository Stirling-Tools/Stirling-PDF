-- Per-team classification taxonomy (gated by policies.enabled): the admin-editable vocabulary the
-- document classifier runs against. One row per team; the whole taxonomy lives as JSON in
-- taxonomy_json (authoritative on read). team_id is the natural key and a plain value (not a foreign
-- key) to stay decoupled from the security entities, so classification can be enabled or disabled
-- without touching them; the sentinel 0 holds the unteamed (login-disabled) taxonomy. Hibernate
-- ddl-auto would also create this, but this keeps the schema explicit for the Flyway-managed
-- deployments.

CREATE TABLE IF NOT EXISTS classification_taxonomies (
    team_id       BIGINT PRIMARY KEY,
    taxonomy_json TEXT,
    updated_at    TIMESTAMP,
    updated_by    VARCHAR(255)
);
