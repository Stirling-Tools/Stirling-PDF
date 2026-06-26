-- Per-source document throughput: one row per source per hour bucket (hours-since-epoch), holding
-- how many documents that source fed into runs in that hour. The Sources overview sums these into
-- lifetime / last-24h / last-30d totals. Gated by policies.enabled like the rest of the subsystem;
-- Hibernate ddl-auto would also create this, but the migration keeps the schema explicit for the
-- Flyway-managed deployments.

CREATE TABLE IF NOT EXISTS policy_source_doc_counts (
    source_id   VARCHAR(255) NOT NULL,
    bucket_hour BIGINT       NOT NULL,
    doc_count   BIGINT       NOT NULL DEFAULT 0,
    PRIMARY KEY (source_id, bucket_hour)
);

-- Window sums filter by bucket_hour within a source's rows.
CREATE INDEX IF NOT EXISTS idx_policy_source_doc_counts_hour
    ON policy_source_doc_counts (source_id, bucket_hour);
