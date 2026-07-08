-- Per-policy processed-file ledger:
--
--   policy_processed_files  one row per (policy, file identity) recording the version a policy
--                           last settled that file at, so folder sources track files in place
--                           instead of moving them into a work directory. signature is a cheap
--                           version gate (folder: size:mtime); content_hash an optional strong
--                           token consulted only when the gate moves. Rows are claimed into
--                           PROCESSING, settled to DONE/ERROR, flipped to INTERRUPTED at boot if
--                           a run died with the JVM, and pruned once the file is gone from all of
--                           the policy's sources, so the table stays near the set of files
--                           currently present.
--
-- Gated by policies.enabled like the rest of the subsystem; Hibernate ddl-auto would also create
-- this, but the migration keeps the schema explicit for the Flyway-managed deployments.

CREATE TABLE IF NOT EXISTS policy_processed_files (
    policy_id     VARCHAR(255)  NOT NULL,
    identity_hash VARCHAR(64)   NOT NULL,
    identity      VARCHAR(4096),
    signature     VARCHAR(255)  NOT NULL,
    content_hash  VARCHAR(64),
    status        VARCHAR(16)   NOT NULL,
    attempts      SMALLINT      NOT NULL DEFAULT 1,
    last_seen     BIGINT        NOT NULL DEFAULT 0,
    updated_at    BIGINT        NOT NULL DEFAULT 0,
    PRIMARY KEY (policy_id, identity_hash)
);

CREATE INDEX IF NOT EXISTS idx_processed_files_policy_seen
    ON policy_processed_files (policy_id, last_seen);
