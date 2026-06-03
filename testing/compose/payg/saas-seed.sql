-- Seed test team / user / payg policy / wallet_policy in PAYG_SHADOW mode.
-- Piped through psql by the cucumber harness AFTER Flyway has run.
--
-- Idempotent — guarded against duplicate keys so re-running on the same
-- container is safe between scenarios.

-- 1. Team referenced by the cucumber feature file ("payg-cucumber-team").
INSERT INTO stirling_pdf.teams (name)
SELECT 'payg-cucumber-team'
WHERE NOT EXISTS (
    SELECT 1 FROM stirling_pdf.teams WHERE name = 'payg-cucumber-team'
);

-- 2. payg_team_extensions sidecar — uses the default pricing policy (seeded
--    by V12). No override needed for the cucumber scenarios.
INSERT INTO stirling_pdf.payg_team_extensions (team_id, pricing_policy_id, stripe_customer_id)
SELECT t.team_id, NULL, NULL
FROM stirling_pdf.teams t
WHERE t.name = 'payg-cucumber-team'
  AND NOT EXISTS (
      SELECT 1 FROM stirling_pdf.payg_team_extensions ext WHERE ext.team_id = t.team_id
  );

-- 3. Test user with a known API key. supabase_id is a deterministic UUID so
--    the test team's owner can be looked up consistently.
INSERT INTO stirling_pdf.users (username, password, enabled, api_key, supabase_id)
SELECT
    'payg-cucumber-user',
    '{noop}cucumber',                                       -- not used; API key path
    TRUE,
    'payg-cucumber-key',                                    -- must match SECURITY_CUSTOMGLOBALAPIKEY
    '00000000-0000-0000-0000-000000000c1c'::uuid             -- deterministic for the steps file
WHERE NOT EXISTS (
    SELECT 1 FROM stirling_pdf.users WHERE username = 'payg-cucumber-user'
);

-- 4. Team membership — make the test user a member (and owner) of the team.
INSERT INTO stirling_pdf.team_memberships (team_id, user_id, role)
SELECT t.team_id, u.user_id, 'LEADER'
FROM stirling_pdf.teams t, stirling_pdf.users u
WHERE t.name = 'payg-cucumber-team'
  AND u.username = 'payg-cucumber-user'
  AND NOT EXISTS (
      SELECT 1 FROM stirling_pdf.team_memberships m
      WHERE m.team_id = t.team_id AND m.user_id = u.user_id
  );

-- 5. wallet_policy in PAYG_SHADOW mode — this is what flips the team into
--    shadow charging. Cap left NULL (no enforcement in shadow).
INSERT INTO stirling_pdf.wallet_policy (team_id, engine, cap_period, warn_at_pct, degrade_at_pct)
SELECT t.team_id, 'PAYG_SHADOW', 'CALENDAR_MONTH', 80, 100
FROM stirling_pdf.teams t
WHERE t.name = 'payg-cucumber-team'
  AND NOT EXISTS (
      SELECT 1 FROM stirling_pdf.wallet_policy wp WHERE wp.team_id = t.team_id
  );

-- If the wallet_policy row was inserted on a previous container start, force
-- the engine to PAYG_SHADOW so a previous test run didn't leave it on LEGACY.
UPDATE stirling_pdf.wallet_policy
SET engine = 'PAYG_SHADOW'
WHERE team_id = (SELECT team_id FROM stirling_pdf.teams WHERE name = 'payg-cucumber-team');
