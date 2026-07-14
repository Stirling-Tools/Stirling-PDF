-- PAYG prepaid-bundle PURCHASE path: the leader-authorized quote ticket and the idempotent credit
-- RPC the Stripe webhook calls once a payment settles. Slice 1 (V39) added the pool + the draw; this
-- adds the way a pool is BOUGHT. Everything additive + idempotent.
--
-- Flow mirrors procurement — Java authorizes + records intent, the edge function owns Stripe, and the
-- result lands via an RPC (Java never touches the Stripe SDK):
--   1. A team LEADER hits POST /api/v1/payg/bundle/quote. Java validates the requested capacity and
--      writes a payg_bundle_quote row: a short-lived "this leader may buy N units" ticket. The
--      per-unit price is NOT set here — it lives in Stripe (a one-time Price at the SAME unit_amount
--      as the meter) and the "12 months for the price of 10" benefit is a Stripe coupon. So the
--      ticket carries only capacity + currency.
--   2. The portal calls the create-payg-bundle-checkout edge fn with the quote id (user JWT). The edge
--      fn reads the ticket (unexpired, team-matched), then creates a mode=payment Checkout Session for
--      quantity = units at the bundle Price + coupon. Stripe is the source of truth for the purchased
--      quantity + amount.
--   3. On checkout.session.completed the stripe-webhook edge fn (service-role) calls
--      payg_credit_bundle() below with the team, the paid line quantity, and the session id — opening
--      one payg_prepaid_bundle pool, idempotent on stripe_ref so Stripe's at-least-once delivery can't
--      double-credit.

-- == payg_bundle_quote =========================================================
CREATE TABLE IF NOT EXISTS stirling_pdf.payg_bundle_quote (
    quote_id     BIGSERIAL     PRIMARY KEY,
    team_id      BIGINT        NOT NULL,
    units        BIGINT        NOT NULL,
    currency     VARCHAR(8)    NOT NULL,
    created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at   TIMESTAMP     NOT NULL
);

-- The checkout edge fn looks a ticket up by id and re-checks it belongs to the team; the same index
-- backs a cheap sweep of lapsed tickets.
CREATE INDEX IF NOT EXISTS idx_payg_bundle_quote_team
    ON stirling_pdf.payg_bundle_quote (team_id, expires_at);

COMMENT ON TABLE stirling_pdf.payg_bundle_quote IS
    'Short-lived, leader-authorized prepaid-bundle purchase tickets. Carries the capacity (units) + '
    'currency the leader committed to; the price lives in Stripe. Read once by the '
    'create-payg-bundle-checkout edge fn; an expired ticket is inert. Not a billing record — the '
    'payg_prepaid_bundle pool opened on webhook is.';

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
