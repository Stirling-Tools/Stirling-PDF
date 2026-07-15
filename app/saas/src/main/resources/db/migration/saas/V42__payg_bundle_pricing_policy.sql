-- Prepaid-bundle Stripe objects on the pricing policy — same home as the metered price ids
-- (pricing_policy_stripe_price). The bundle is bought at a one-time Price whose unit_amount matches
-- the meter, discounted by a coupon; both are per-policy config so ops can point a policy at its
-- Stripe objects without an env var or code change.
--
--   * bundle_stripe_price_id — the ONE-TIME Price (Stripe currency_options cover all currencies on a
--     single Price, so one id per policy, exactly like the metered price).
--   * bundle_coupon_id        — the "12 months for the price of 10" coupon.
--
-- NULL on both = bundles not offered for that policy; the create-payg-bundle-checkout edge fn refuses
-- to mint a session. Additive + idempotent. Money still lives in Stripe — these are just the handles.

ALTER TABLE stirling_pdf.pricing_policy
    ADD COLUMN IF NOT EXISTS bundle_stripe_price_id VARCHAR(128);
ALTER TABLE stirling_pdf.pricing_policy
    ADD COLUMN IF NOT EXISTS bundle_coupon_id VARCHAR(128);

COMMENT ON COLUMN stirling_pdf.pricing_policy.bundle_stripe_price_id IS
    'One-time Stripe Price id for prepaid-bundle checkout (same unit_amount as the metered price). '
    'NULL = bundles not offered for this policy.';
COMMENT ON COLUMN stirling_pdf.pricing_policy.bundle_coupon_id IS
    'Stripe coupon id applying the 12-for-10 prepaid discount. NULL = bundles not offered.';
