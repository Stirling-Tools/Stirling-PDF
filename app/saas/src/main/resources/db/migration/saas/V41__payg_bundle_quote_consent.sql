-- Consent capture on the prepaid-bundle purchase ticket (California ARL B&P §17602 / EULA §7.2).
--
-- The buyer must affirmatively consent, BEFORE payment, to the automatic transition to metered PAYG
-- when the prepaid term ends. We record that consent on the quote ticket (the leader-authorized
-- purchase intent) so we can prove what was agreed: EULA version + timestamp + the disclosed price.
-- Capacity (units) + currency already live on the row; the term is deterministic (12 months from
-- purchase), so it isn't stored separately. The create-payg-bundle-checkout edge fn refuses to mint a
-- Checkout Session for a ticket without consent. Additive + idempotent.

ALTER TABLE stirling_pdf.payg_bundle_quote
    ADD COLUMN IF NOT EXISTS consented_at TIMESTAMP;
ALTER TABLE stirling_pdf.payg_bundle_quote
    ADD COLUMN IF NOT EXISTS eula_version VARCHAR(32);
ALTER TABLE stirling_pdf.payg_bundle_quote
    ADD COLUMN IF NOT EXISTS price_minor BIGINT;

COMMENT ON COLUMN stirling_pdf.payg_bundle_quote.consented_at IS
    'When the leader affirmatively consented (ARL/EULA §7.2) to the prepaid→metered auto-transition. '
    'NULL = no consent captured; the checkout edge fn refuses to create a session.';
COMMENT ON COLUMN stirling_pdf.payg_bundle_quote.eula_version IS
    'EULA version string shown at consent — proof of exactly what terms were agreed to.';
COMMENT ON COLUMN stirling_pdf.payg_bundle_quote.price_minor IS
    'One-time price disclosed at consent, minor units of currency; NULL when the rate was unknown.';
