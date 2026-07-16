-- PAYG prepaid-bundle PURCHASE path: the idempotent credit RPC the Stripe webhook calls once a
-- payment settles. Slice 1 (V39) added the pool + the draw; this adds the way a pool is CREDITED.
-- Everything additive + idempotent.
--
-- Flow (Java never touches the Stripe SDK): the portal calls the create-payg-bundle-checkout edge fn
-- directly with the team + requested capacity (units) + consent — no server-side quote ticket; the
-- price lives in Stripe (a one-time Price at the SAME unit_amount as the meter, with a "12 months for
-- the price of 10" coupon). On checkout.session.completed the payg-subscription-webhook edge fn
-- (service-role) calls payg_credit_bundle() below with the team, the paid line quantity, and the
-- session id — opening one payg_prepaid_bundle pool, idempotent on stripe_ref so Stripe's
-- at-least-once delivery can't double-credit.

-- == payg_credit_bundle ========================================================
-- Opens one prepaid pool for a settled purchase. Called by the stripe-webhook edge fn (service-role,
-- which bypasses RLS) on checkout.session.completed. Idempotent on stripe_ref: Stripe delivers
-- webhooks at least once, so a repeat call for the same session is a no-op that returns the pool that
-- already exists. The 12-month term is applied here so the expiry rule has a single home. Mirrors the
-- V14 payg_link_subscription pattern (SECURITY INVOKER; the only writers of pool state go through an
-- RPC rather than direct table writes from the edge fn).
CREATE OR REPLACE FUNCTION stirling_pdf.payg_credit_bundle(
    p_team_id      BIGINT,
    p_units        BIGINT,
    p_stripe_ref   TEXT,
    p_term_months  INTEGER DEFAULT 12
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_bundle_id BIGINT;
BEGIN
    IF p_units IS NULL OR p_units <= 0 THEN
        RAISE EXCEPTION 'payg_credit_bundle: units must be positive (got %)', p_units
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_stripe_ref IS NULL OR length(trim(p_stripe_ref)) = 0 THEN
        RAISE EXCEPTION 'payg_credit_bundle: stripe_ref is required for idempotency'
            USING ERRCODE = 'not_null_violation';
    END IF;

    INSERT INTO stirling_pdf.payg_prepaid_bundle(
        team_id, units_total, units_remaining, purchased_at, expires_at, stripe_ref)
    VALUES (
        p_team_id, p_units, p_units, now(),
        now() + make_interval(months => p_term_months), p_stripe_ref)
    ON CONFLICT (stripe_ref) WHERE stripe_ref IS NOT NULL
    DO NOTHING
    RETURNING bundle_id INTO v_bundle_id;

    -- Idempotent replay: the pool for this Stripe payment already exists — return its id.
    IF v_bundle_id IS NULL THEN
        SELECT bundle_id INTO v_bundle_id
          FROM stirling_pdf.payg_prepaid_bundle
         WHERE stripe_ref = p_stripe_ref;
    END IF;

    RETURN v_bundle_id;
END $$;

COMMENT ON FUNCTION stirling_pdf.payg_credit_bundle(BIGINT, BIGINT, TEXT, INTEGER) IS
    'Opens (or idempotently returns) a prepaid unit pool for a settled Stripe purchase. Idempotent on '
    'stripe_ref; applies the 12-month term. Called by the stripe-webhook edge fn on '
    'checkout.session.completed with the service-role key.';
