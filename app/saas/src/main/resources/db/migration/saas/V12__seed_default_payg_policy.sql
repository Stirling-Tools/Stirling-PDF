-- Seed the V1 default pricing policy. Idempotent — only inserts when no default row exists.
-- Units sized so a typical 25-page / 5 MiB document is 1 unit; tune via admin endpoints once
-- Stripe Prices are wired in production.
--
-- This migration is separated from V11 because V11 has already shipped to main — adding rows to
-- it would change its Flyway checksum and break existing deployments.

INSERT INTO pricing_policy (
    version, effective_from, doc_pages_per_unit, doc_bytes_per_unit,
    min_charge_units, file_unit_cap, is_default, notes, created_by
)
SELECT
    'v1-initial', CURRENT_TIMESTAMP, 25, 5242880,
    1, 1000, TRUE,
    'V1 default seeded by V12 migration. Tune via admin once Stripe Prices are configured.',
    'system'
WHERE NOT EXISTS (
    SELECT 1 FROM pricing_policy WHERE is_default = TRUE
);

-- Step limits for the default policy across every JobSource. References the row inserted above
-- via the partial unique index on is_default=TRUE.
INSERT INTO pricing_policy_step_limit (policy_id, job_source, step_limit)
SELECT p.policy_id, src.job_source, src.step_limit
FROM pricing_policy p
CROSS JOIN (
    VALUES
        ('WEB', 10),
        ('API', 10),
        ('PIPELINE', 20),     -- automations get a longer chain
        ('DESKTOP_APP', 10)
) AS src(job_source, step_limit)
WHERE p.is_default = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM pricing_policy_step_limit s
    WHERE s.policy_id = p.policy_id AND s.job_source = src.job_source
  );
