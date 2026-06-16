-- PAYG free allowance: monthly per-cycle allowance → one-time LIFETIME grant.
--
-- Product decision (2026-06-11): every team gets a one-time free document grant. It does NOT
-- replenish monthly and is NOT lost when the team subscribes — they keep whatever is unused.
--
-- Mechanics: the grant is tracked as a running counter on the team sidecar
-- (payg_team_extensions.free_units_remaining), seeded once from the team's effective pricing
-- policy and maintained by the charge pipeline (deducted when a billable DEBIT is written,
-- restored on a first-step refund). Because the counter is authoritative, the wallet_ledger is
-- no longer the source of truth for the grant and its old rows can be pruned after a retention
-- window (separate future job).

-- ---------------------------------------------------------------------------------------------
-- 1. Rename the policy column — it is no longer "per cycle", it's the one-time grant size.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE stirling_pdf.pricing_policy
    RENAME COLUMN free_tier_units_per_cycle TO free_tier_units;

COMMENT ON COLUMN stirling_pdf.pricing_policy.free_tier_units IS
    'One-time lifetime free document grant handed to a team on creation (copied into '
    'payg_team_extensions.free_units_remaining). NOT per-cycle: it never replenishes and '
    'survives subscribing. 0 = no free grant (block / meter from the first document).';

-- ---------------------------------------------------------------------------------------------
-- 2. The running counter on the team sidecar.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE stirling_pdf.payg_team_extensions
    ADD COLUMN IF NOT EXISTS free_units_remaining BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN stirling_pdf.payg_team_extensions.free_units_remaining IS
    'Remaining one-time free documents for this team. Seeded from the effective pricing '
    'policy''s free_tier_units at row creation; decremented by min(jobUnits, remaining) when a '
    'billable charge is written; restored on a first-step refund. Lifetime — never resets. '
    'Authoritative source for the free grant (independent of wallet_ledger retention).';

-- ---------------------------------------------------------------------------------------------
-- 3. Per-job free/paid split on the shadow row — makes metering + refunds exact and removes
--    any need to SUM the ledger over a team's lifetime.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE stirling_pdf.payg_shadow_charge
    ADD COLUMN IF NOT EXISTS free_units_consumed INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN stirling_pdf.payg_shadow_charge.free_units_consumed IS
    'How many of this job''s payg_units came out of the team''s free grant at charge time. '
    'Paid (metered) units = payg_units - free_units_consumed. A refund restores this many '
    'units to payg_team_extensions.free_units_remaining.';

-- ---------------------------------------------------------------------------------------------
-- 4. Seed the counter at team creation. Replace the V14 trigger function so new teams get the
--    default policy's grant from minute one. (The trigger itself still points at this function.)
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION stirling_pdf.payg_create_team_extensions_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO stirling_pdf.payg_team_extensions(team_id, free_units_remaining)
    VALUES (
        NEW.team_id,
        COALESCE(
            (SELECT pp.free_tier_units FROM stirling_pdf.pricing_policy pp
              WHERE pp.is_default = TRUE LIMIT 1),
            0)
    )
    ON CONFLICT (team_id) DO NOTHING;
    RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 5. Backfill existing teams. remaining = max(0, grant - lifetime_consumed). lifetime_consumed
--    is -SUM(amount_units) over the team's DEBIT+REFUND ledger entries (debits negative, refunds
--    positive), so grant + SUM(amount_units) collapses to grant - consumed. One-time read of the
--    ledger; after this the counter stands alone. Grant = team override policy, else the default.
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
            0));
