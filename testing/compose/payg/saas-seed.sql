-- Seed test team / payg policy / wallet_policy in PAYG_SHADOW mode for the
-- cucumber harness. Applied by the `seed-saas` service in
-- docker-compose-saas.yml once the backend is healthy, which is the earliest
-- point at which Hibernate has built the tables these rows target. To re-run
-- it by hand against a live stack:
--
--   psql -h localhost -p 5433 -U postgres -d postgres \
--        -f testing/compose/payg/saas-seed.sql
--
-- In a real SaaS database these tables and their seed rows come from the
-- Supabase migrations; the harness postgres has none, so Hibernate builds
-- the tables from the entities (see docker-compose-saas.yml) and this file
-- supplies the rows. Hibernate's DDL carries no SQL DEFAULTs, so every NOT
-- NULL column is set explicitly below, including the timestamps that
-- @CreationTimestamp would normally fill in application-side.
--
-- Idempotent — guarded against duplicate keys so re-running on the same
-- container is safe between scenarios.

-- ---------------------------------------------------------------------------
-- 0. Default pricing policy + per-source step limits.
--    Required because PricingPolicyService.getEffectivePolicy() throws if
--    no row has is_default = TRUE. free_tier_units 500 matches the launch
--    free tier, granted per billing period.
-- ---------------------------------------------------------------------------
INSERT INTO stirling_pdf.pricing_policy (
    version, effective_from, doc_pages_per_unit, doc_bytes_per_unit,
    min_charge_units, file_unit_cap, free_tier_units, is_default,
    notes, created_by, created_at
)
SELECT
    'v1-cucumber', CURRENT_TIMESTAMP, 25, 5242880,
    1, 1000, 500, TRUE,
    'Cucumber test default policy', 'system',
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM stirling_pdf.pricing_policy WHERE is_default = TRUE
);

INSERT INTO stirling_pdf.pricing_policy_step_limit (policy_id, job_source, step_limit)
SELECT p.policy_id, src.job_source, src.step_limit
FROM stirling_pdf.pricing_policy p
CROSS JOIN (
    VALUES
        ('WEB', 10),
        ('API', 10),
        ('PIPELINE', 20),
        ('DESKTOP_APP', 10)
) AS src(job_source, step_limit)
WHERE p.is_default = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM stirling_pdf.pricing_policy_step_limit s
    WHERE s.policy_id = p.policy_id AND s.job_source = src.job_source
  );

-- ---------------------------------------------------------------------------
-- 1. Test team. The Stirling-PDF backend auto-creates `Default` and
--    `Internal` teams at boot; we add a third one specifically for the
--    PAYG scenarios so we can isolate state and assert per-team.
-- ---------------------------------------------------------------------------
INSERT INTO stirling_pdf.teams (name)
SELECT 'payg-cucumber-team'
WHERE NOT EXISTS (
    SELECT 1 FROM stirling_pdf.teams WHERE name = 'payg-cucumber-team'
);

-- ---------------------------------------------------------------------------
-- 2. payg_team_extensions sidecar, pinned to the default pricing policy with
--    a full free-tier grant for the current calendar month. Without this row
--    the team has no grant and every tool call is refused with
--    402 PAYG_LIMIT_REACHED.
-- ---------------------------------------------------------------------------
INSERT INTO stirling_pdf.payg_team_extensions (
    team_id, pricing_policy_id, free_units_remaining, free_units_period_start,
    created_at, updated_at, version
)
SELECT t.team_id, p.policy_id, p.free_tier_units, date_trunc('month', CURRENT_TIMESTAMP),
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0
FROM stirling_pdf.teams t
CROSS JOIN stirling_pdf.pricing_policy p
WHERE t.name = 'payg-cucumber-team'
  AND p.is_default = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM stirling_pdf.payg_team_extensions ext WHERE ext.team_id = t.team_id
  );

-- ---------------------------------------------------------------------------
-- 3. Bind the auto-created CUSTOM_API_USER to our cucumber team. The user
--    is created by the backend's SECURITY_CUSTOMGLOBALAPIKEY handling — we
--    don't seed our own user (would collide on the unique api_key).
--    Update their primary `team_id` so JobChargeService picks up
--    payg-cucumber-team as the owner team on requests.
-- ---------------------------------------------------------------------------
UPDATE stirling_pdf.users u
SET team_id = (SELECT team_id FROM stirling_pdf.teams WHERE name = 'payg-cucumber-team')
WHERE u.username = 'CUSTOM_API_USER';

-- ---------------------------------------------------------------------------
-- 4. Team membership row so /teams/* admin paths recognise the user.
-- ---------------------------------------------------------------------------
INSERT INTO stirling_pdf.team_memberships (
    team_id, user_id, role, invited_at, created_at, updated_at
)
SELECT t.team_id, u.user_id, 'LEADER',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM stirling_pdf.teams t, stirling_pdf.users u
WHERE t.name = 'payg-cucumber-team'
  AND u.username = 'CUSTOM_API_USER'
  AND NOT EXISTS (
      SELECT 1 FROM stirling_pdf.team_memberships m
      WHERE m.team_id = t.team_id AND m.user_id = u.user_id
  );

-- ---------------------------------------------------------------------------
-- 5. wallet_policy in PAYG_SHADOW mode. auto_group_strategy is NOT NULL
--    with no SQL default, so it has to carry a value; 'AUTO' matches the
--    entity's field default.
-- ---------------------------------------------------------------------------
INSERT INTO stirling_pdf.wallet_policy (
    team_id, engine, cap_period, warn_at_pct, degrade_at_pct,
    degraded_feature_set, auto_group_strategy, notification_emails,
    updated_at
)
SELECT t.team_id, 'PAYG_SHADOW', 'CALENDAR_MONTH', 80, 100,
       'MINIMAL', 'AUTO', '[]'::jsonb, CURRENT_TIMESTAMP
FROM stirling_pdf.teams t
WHERE t.name = 'payg-cucumber-team'
  AND NOT EXISTS (
      SELECT 1 FROM stirling_pdf.wallet_policy wp WHERE wp.team_id = t.team_id
  );

UPDATE stirling_pdf.wallet_policy
SET engine = 'PAYG_SHADOW', updated_at = CURRENT_TIMESTAMP
WHERE team_id = (SELECT team_id FROM stirling_pdf.teams WHERE name = 'payg-cucumber-team');
