-- Per-source document throughput, in two tables:
--
--   policy_source_doc_counts  one row per source per hour bucket (hours-since-epoch), holding how
--                             many documents that source fed into runs in that hour. Feeds the
--                             rolling last-24h / last-30d windows and the 30-day daily series, and
--                             is pruned to that window so it stays bounded.
--   policy_source_doc_totals  a denormalized lifetime total per source, incremented alongside the
--                             hourly bucket, so the overview reads the all-time figure in one row
--                             instead of scanning a source's whole bucket history - and so the
--                             hourly buckets can be pruned without losing it.
--
-- Gated by policies.enabled like the rest of the subsystem; Hibernate ddl-auto would also create
-- these, but the migration keeps the schema explicit for the Flyway-managed deployments.

CREATE TABLE IF NOT EXISTS policy_source_doc_counts (
    source_id   VARCHAR(255) NOT NULL,
    bucket_hour BIGINT       NOT NULL,
    doc_count   BIGINT       NOT NULL DEFAULT 0,
    PRIMARY KEY (source_id, bucket_hour)
);

CREATE TABLE IF NOT EXISTS policy_source_doc_totals (
    source_id VARCHAR(255) NOT NULL,
    doc_total BIGINT       NOT NULL DEFAULT 0,
    PRIMARY KEY (source_id)
);
