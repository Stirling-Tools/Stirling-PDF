-- PAYG subscription state — the column + functions that let new customers reach Stripe billing.
--
-- This migration is half of the Stripe/Supabase wire-up (PR-SB-1 in `notes/PAYG_DESIGN.md`
-- revision note + `payg-stripe-supabase-plan.html`). It's strictly additive:
--   * one new column on payg_team_extensions (payg_subscription_id)
--   * one new column on pricing_policy   (free_tier_units_per_cycle)
--   * two RPC functions (payg_link_subscription, payg_unlink_subscription) — the only writers
--     of subscription state, called by stripe-webhook + create-payg-team-subscription edge fns
--   * an AFTER-INSERT trigger on teams that auto-creates the payg_team_extensions sidecar row
--     so every new signup is PAYG-by-default
--   * an RLS policy that lets team LEADERs (and the service role) link subscriptions
--
-- No behaviour change for the running app until PR-SB-4 wires PaygMeterReportingService and
-- the free-tier gate into JobChargeService. Until then this just exposes new state for the
-- edge functions in PR-SB-2 to write through to.
--
-- Design references:
--   * notes/PAYG_DESIGN.md (revision note 2026-06-03 — "subscription presence is the gate")
--   * payg-stripe-supabase-plan.html §3.1 — RPC functions; §3.5 — RLS policy

-- ---------------------------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------------------------

ALTER TABLE stirling_pdf.payg_team_extensions
    ADD COLUMN IF NOT EXISTS payg_subscription_id VARCHAR(128) UNIQUE;

COMMENT ON COLUMN stirling_pdf.payg_team_extensions.payg_subscription_id IS
    'Stripe subscription id (sub_xxx) for this team''s PAYG metered subscription. '
    'NULL = team has not added a card yet; engine writes shadow rows only. '
    'NOT NULL = engine posts meter events to Stripe on every billable tool call. '
    'Mutated exclusively by payg_link_subscription / payg_unlink_subscription RPC functions.';

ALTER TABLE stirling_pdf.pricing_policy
    ADD COLUMN IF NOT EXISTS free_tier_units_per_cycle BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN stirling_pdf.pricing_policy.free_tier_units_per_cycle IS
    'Doc units a team on this policy can consume per cycle before they must add a card. '
    'Default 0 = no free tier (block immediately). The seeded default policy will set this '
    'to the launch free-tier size; the special "launch" policy used by the day-1 legacy '
    'migration script (see PAYG_DESIGN.md §3.10 revised) can override.';

-- ---------------------------------------------------------------------------------------------
-- 2. RPC: payg_link_subscription
--
-- Called by:
--   * supabase/functions/create-payg-team-subscription/index.ts (post-Stripe-Checkout, with
--     either user JWT [normal path, RLS-enforced] or service-role [day-1 migration script])
--   * supabase/functions/stripe-webhook/handlers/payg-subscription.ts on
--     customer.subscription.created (idempotent — second invocation with same args is a no-op)
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION stirling_pdf.payg_link_subscription(
    p_team_id         BIGINT,
    p_customer_id     TEXT,
    p_subscription_id TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    UPDATE stirling_pdf.payg_team_extensions
       SET stripe_customer_id   = p_customer_id,
           payg_subscription_id = p_subscription_id,
           updated_at           = now()
     WHERE team_id = p_team_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'payg_team_extensions row missing for team %', p_team_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    INSERT INTO stirling_pdf.payg_subscription_change_log(team_id, action, subscription_id)
                                                  VALUES (p_team_id, 'LINKED', p_subscription_id);
END $$;

COMMENT ON FUNCTION stirling_pdf.payg_link_subscription(BIGINT, TEXT, TEXT) IS
    'Idempotent link of a Stripe subscription to a team. SECURITY INVOKER means RLS applies — '
    'the caller must be a LEADER of the team (or hold the service-role bypass). '
    'Writes an audit row to payg_subscription_change_log.';

-- ---------------------------------------------------------------------------------------------
-- 3. RPC: payg_unlink_subscription
--
-- Called by stripe-webhook handlers/payg-subscription.ts on customer.subscription.deleted
-- (after Stripe's own retries have given up). Drops the team back to free-tier-then-block.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION stirling_pdf.payg_unlink_subscription(
    p_team_id BIGINT,
    p_reason  TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    UPDATE stirling_pdf.payg_team_extensions
       SET payg_subscription_id = NULL,
           updated_at           = now()
     WHERE team_id = p_team_id;
    -- We deliberately keep stripe_customer_id — the team may add a new card later and we'd
    -- like to reuse the existing Stripe customer record rather than create a duplicate.

    INSERT INTO stirling_pdf.payg_subscription_change_log(team_id, action, reason)
                                                  VALUES (p_team_id, 'UNLINKED', p_reason);
END $$;

COMMENT ON FUNCTION stirling_pdf.payg_unlink_subscription(BIGINT, TEXT) IS
    'Drops the team back to free-tier-then-block derived state. Reason is logged for audit '
    '(typically subscription_deleted | admin | card_removed).';

-- ---------------------------------------------------------------------------------------------
-- 4. Auto-create payg_team_extensions row when a team is created
--
-- Every new signup gets a payg_team_extensions row with NULL pricing_policy_id (which the
-- backend's PricingPolicyService resolves to the default policy). The free-tier gate kicks in
-- from the very first tool call.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION stirling_pdf.payg_create_team_extensions_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO stirling_pdf.payg_team_extensions(team_id)
                                          VALUES (NEW.team_id)
    ON CONFLICT (team_id) DO NOTHING;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payg_create_team_extensions ON stirling_pdf.teams;
CREATE TRIGGER trg_payg_create_team_extensions
    AFTER INSERT ON stirling_pdf.teams
    FOR EACH ROW
    EXECUTE FUNCTION stirling_pdf.payg_create_team_extensions_trigger();

COMMENT ON TRIGGER trg_payg_create_team_extensions ON stirling_pdf.teams IS
    'Ensures every team has a payg_team_extensions sidecar row from creation. New customers '
    'are PAYG-default from minute one — they consume free-tier units until they add a card.';

-- ---------------------------------------------------------------------------------------------
-- 5. Backfill: any existing team without a sidecar row gets one now
-- ---------------------------------------------------------------------------------------------

INSERT INTO stirling_pdf.payg_team_extensions(team_id)
SELECT t.team_id
  FROM stirling_pdf.teams t
 WHERE NOT EXISTS (
     SELECT 1 FROM stirling_pdf.payg_team_extensions x WHERE x.team_id = t.team_id
 );

-- ---------------------------------------------------------------------------------------------
-- 6. RLS policy
--
-- Service-role bypasses RLS (backend reads + day-1 migration script writes via the service-role
-- key). For user-initiated writes via the frontend Add-Card flow, only team LEADERs can link a
-- subscription. SELECT remains permissive — anyone in the team can see the row.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE stirling_pdf.payg_team_extensions ENABLE ROW LEVEL SECURITY;

-- Read: any team member can see their team's payg row.
DROP POLICY IF EXISTS payg_team_ext_select ON stirling_pdf.payg_team_extensions;
CREATE POLICY payg_team_ext_select
    ON stirling_pdf.payg_team_extensions
    FOR SELECT
    USING (
        team_id IN (
            SELECT tm.team_id
              FROM stirling_pdf.team_memberships tm
              JOIN stirling_pdf.users u ON u.user_id = tm.user_id
             WHERE u.supabase_auth_id = auth.uid()
        )
    );

-- Update: only LEADERs of the team can update (i.e. link / unlink a subscription).
DROP POLICY IF EXISTS payg_team_ext_leader_update ON stirling_pdf.payg_team_extensions;
CREATE POLICY payg_team_ext_leader_update
    ON stirling_pdf.payg_team_extensions
    FOR UPDATE
    USING (
        team_id IN (
            SELECT tm.team_id
              FROM stirling_pdf.team_memberships tm
              JOIN stirling_pdf.users u ON u.user_id = tm.user_id
             WHERE u.supabase_auth_id = auth.uid()
               AND tm.role = 'LEADER'
        )
    );
