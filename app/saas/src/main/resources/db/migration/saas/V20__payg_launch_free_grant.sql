-- PAYG launch free grant: give the default pricing policy a real one-time grant.
--
-- V14 added pricing_policy.free_tier_units with DEFAULT 0, and the default policy seeded in V12
-- predates the column — so on a fresh deploy every team's free_units_remaining seeds to 0 and
-- V19's "every team gets a one-time free grant" intent ships dead (teams are gated / metered from
-- the very first billable document). This migration sets the launch grant on the default policy
-- and re-seeds existing teams that V19 left at 0 (V19 ran its backfill while the grant was still
-- 0, so every then-existing team computed to 0).
--
-- The launch value lives on the default policy row; tune it there (or via a future admin surface).
-- Both updates are guarded so a deliberately-tuned value — e.g. a smaller test grant — is never
-- clobbered.

-- ---------------------------------------------------------------------------------------------
-- 1. Launch grant on the default policy, only where it's still the accidental 0.
-- ---------------------------------------------------------------------------------------------
UPDATE stirling_pdf.pricing_policy
   SET free_tier_units = 500
 WHERE is_default = TRUE
   AND free_tier_units = 0;

-- ---------------------------------------------------------------------------------------------
-- 2. Re-seed existing teams V19 left at 0. Same recompute as V19's backfill — remaining =
--    max(0, grant + net signed DEBIT/REFUND) — now that the grant is non-zero. Guarded to
--    free_units_remaining = 0: a team with a deliberately-set positive balance is left alone, and
--    a team that genuinely exhausted a real grant also recomputes to 0, so the guard is safe.
-- ---------------------------------------------------------------------------------------------
UPDATE stirling_pdf.payg_team_extensions ext
   SET free_units_remaining = GREATEST(
        0,
        COALESCE(
            (SELECT pp.free_tier_units FROM stirling_pdf.pricing_policy pp
              WHERE pp.policy_id = ext.pricing_policy_id),
            (SELECT pp.free_tier_units FROM stirling_pdf.pricing_policy pp
              WHERE pp.is_default = TRUE LIMIT 1),
            0)
        + COALESCE(
            (SELECT SUM(wl.amount_units) FROM stirling_pdf.wallet_ledger wl
              WHERE wl.team_id = ext.team_id
                AND wl.entry_type IN ('DEBIT', 'REFUND')),
            0))
 WHERE ext.free_units_remaining = 0;
