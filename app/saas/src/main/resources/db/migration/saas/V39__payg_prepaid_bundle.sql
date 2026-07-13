-- PAYG prepaid usage bundles: a discounted, expiring pool of units consumed ahead of the meter.
--
-- A team lead pre-buys N units for a one-time payment ("12 months for the price of 10"). The pool is
-- drawn down AFTER the free grant and BEFORE metered PAYG (free -> prepaid -> metered), booked to the
-- BOUGHT ledger bucket so it never counts against the spend cap or the Stripe meter, and expires 12
-- months after purchase (unused units forfeit; no roll-over). Multiple pools (top-ups) are drawn
-- FIFO by soonest expiry.
--
-- Money lives in Stripe: the one-time amount + currency are on the Checkout Session / PaymentIntent
-- referenced by stripe_ref, and unit-cost math comes from the team's pricing policy at charge time.
-- So this row carries only capacity + term + the Stripe link. Everything additive + idempotent.

-- == payg_prepaid_bundle =======================================================
CREATE TABLE IF NOT EXISTS payg_prepaid_bundle (
    bundle_id        BIGSERIAL     PRIMARY KEY,
    team_id          BIGINT        NOT NULL,
    units_total      BIGINT        NOT NULL,
    units_remaining  BIGINT        NOT NULL,
    purchased_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at       TIMESTAMP     NOT NULL,
    stripe_ref       VARCHAR(128),
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- FIFO draw + expiry filter: a team's still-drawable pools, soonest-expiring first.
CREATE INDEX IF NOT EXISTS idx_payg_prepaid_bundle_team_expiry
    ON payg_prepaid_bundle (team_id, expires_at)
    WHERE units_remaining > 0;

-- One pool per Stripe payment — makes the webhook credit idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payg_prepaid_bundle_stripe_ref
    ON payg_prepaid_bundle (stripe_ref)
    WHERE stripe_ref IS NOT NULL;

COMMENT ON TABLE payg_prepaid_bundle IS
    'Prepaid, expiring unit pools consumed after the free grant and before the meter (BOUGHT bucket, '
    'outside the spend cap). Money + currency live in Stripe via stripe_ref; capacity + term here.';
COMMENT ON COLUMN payg_prepaid_bundle.units_remaining IS
    'Live balance; pessimistic-locked on draw. Status is derived, not stored: EXHAUSTED = 0, '
    'EXPIRED = now() > expires_at, else ACTIVE.';

-- == payg_shadow_charge ========================================================
-- Freeze the prepaid portion of each charge (mirrors free_units_consumed) so the free/prepaid/metered
-- split is exact and a refund restores the right pool. Metered = payg_units - free - bundle.
ALTER TABLE payg_shadow_charge
    ADD COLUMN IF NOT EXISTS bundle_units_consumed INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN payg_shadow_charge.bundle_units_consumed IS
    'Units of this charge drawn from prepaid bundles (BOUGHT bucket). Metered portion = payg_units '
    '- free_units_consumed - bundle_units_consumed. Restored to a pool on refund.';
