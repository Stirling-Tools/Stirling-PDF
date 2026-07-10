-- ============================================================================
-- One-off data migration: unlimited team seats + repair mis-flagged personal teams
-- ============================================================================
-- Run this ONCE in the Supabase SQL editor against the target project (prod).
-- It is idempotent — re-running it is safe.
--
-- Why: under the PAYG model teams are unlimited, but existing rows carry the old
-- max_seats = 1 default (so the portal shows "used / 1") and some solo teams were
-- created with is_personal = FALSE (so their sole owner hits the "You are the last
-- leader of your team" guard when accepting an invite to another team).
--
-- The app tables live in the stirling_pdf schema (spring.flyway.default-schema).
SET search_path TO stirling_pdf;

-- 1) Unlimited seats for every team (0 = unlimited; the frontend reads <= 0 as "no limit").
UPDATE saas_team_extensions
SET max_seats = 0,
    seat_count = 0
WHERE max_seats <> 0
   OR seat_count <> 0;

-- 2) Repair mis-flagged personal teams. A team with a single membership, no active
--    subscription and no active linked instance is effectively a disposable personal
--    team; flag it so the orphan guard exempts it (and it stops being rename-locked as
--    a "shared" team). It will auto-convert back to STANDARD on its first invite.
UPDATE saas_team_extensions e
SET is_personal = TRUE,
    team_type = 'PERSONAL'
WHERE e.is_personal = FALSE
  AND (SELECT COUNT(*) FROM team_memberships m WHERE m.team_id = e.team_id) <= 1
  AND NOT EXISTS (
        SELECT 1 FROM billing_subscriptions b
        WHERE b.team_id = e.team_id
          AND b.status IN ('active', 'trialing', 'past_due'))
  AND NOT EXISTS (
        SELECT 1 FROM linked_instance li
        WHERE li.team_id = e.team_id
          AND li.revoked_at IS NULL);

-- Optional sanity check after running:
--   SELECT is_personal, team_type, max_seats, seat_count, COUNT(*)
--   FROM saas_team_extensions GROUP BY 1, 2, 3, 4 ORDER BY 1, 2;
