-- Per-policy processed-file ledger for policy input sources:
--
--   policy_processed_files  one row per (policy, file identity), replacing the old scheme of
--                           physically moving inputs into a .stirling work directory. The identity
--                           is an opaque source-owned string (folder: canonical absolute path);
--                           the signature is an opaque version token (folder: size:mtime or a
--                           content hash) so a changed file is reprocessed. Rows are claimed by a
--                           compare-and-swap into PROCESSING, settled to DONE/ERROR at run
--                           completion, flipped to INTERRUPTED at boot if a run died with the JVM,
--                           and removed by presence reconciliation once the file is confirmed gone
--                           from all of the policy's sources - so the table tracks roughly the
--                           files currently present, not everything ever seen.
--
-- Gated by policies.enabled like the rest of the subsystem; Hibernate ddl-auto would also create
-- this, but the migration keeps the schema explicit for the Flyway-managed deployments.

CREATE TABLE IF NOT EXISTS policy_processed_files (
    policy_id     VARCHAR(255)  NOT NULL,
    identity_hash VARCHAR(64)   NOT NULL,
    identity      VARCHAR(4096),
    signature     VARCHAR(255)  NOT NULL,
    status        VARCHAR(16)   NOT NULL,
    attempts      SMALLINT      NOT NULL DEFAULT 1,
    last_seen     BIGINT        NOT NULL DEFAULT 0,
    updated_at    BIGINT        NOT NULL DEFAULT 0,
    PRIMARY KEY (policy_id, identity_hash)
);

CREATE INDEX IF NOT EXISTS idx_processed_files_policy_seen
    ON policy_processed_files (policy_id, last_seen);
