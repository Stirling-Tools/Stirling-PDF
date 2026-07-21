-- Seed test team / payg policy / wallet_policy in PAYG_SHADOW mode for the
-- cucumber harness. Piped through psql AFTER Hibernate has built the schema
-- on backend startup (compose disables Flyway — see docker-compose-saas.yml
-- for the rationale: saas Flyway migrations assume `users` + `teams` exist
-- because Supabase normally provisions them).
--
-- Idempotent — guarded against duplicate keys so re-running on the same
-- container is safe between scenarios.

-- ---------------------------------------------------------------------------
-- 0. Default pricing policy + per-source step limits (V12 in production).
--    Required because PricingPolicyService.getEffectivePolicy() throws if
--    no row has is_default = TRUE. Explicit timestamps because Hibernate's
--    @CreationTimestamp is application-side; direct INSERTs bypass it.
-- ---------------------------------------------------------------------------
-- NOTE: free_tier_units_per_cycle is supplied explicitly because the cucumber
-- harness disables Flyway (see docker-compose-saas.yml). Hibernate's DDL
-- emits NOT NULL without a SQL DEFAULT (the JPA field default `= 0L` is
-- JVM-side only), so the column would otherwise reject this INSERT.
-- 500 matches the launch free-tier (PAYG_DESIGN §3.10 revised).
INSERT INTO stirling_pdf.pricing_policy (
    version, effective_from, doc_pages_per_unit, doc_bytes_per_unit,
    min_charge_units, file_unit_cap, free_tier_units_per_cycle, is_default,
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
-- 2. payg_team_extensions sidecar — uses the default pricing policy.
-- ---------------------------------------------------------------------------
INSERT INTO stirling_pdf.payg_team_extensions (team_id, pricing_policy_id, stripe_customer_id)
SELECT t.team_id, NULL, NULL
FROM stirling_pdf.teams t
WHERE t.name = 'payg-cucumber-team'
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
--    All timestamp columns set explicitly because Hibernate-generated DDL
--    doesn't carry the Flyway-migration DEFAULT CURRENT_TIMESTAMP.
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
-- 5. wallet_policy in PAYG_SHADOW mode.
--    auto_group_strategy is the dead column tracked for drop in PR-R11
--    (PAYG_DESIGN.md §7.7) — until that ships, the NOT NULL constraint
--    means we have to populate it. 'AUTO' is the prod default.
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
