-- Stripe Quote support: a procurement quote is issued as a real Stripe Quote (finalized → PDF +
-- shareable), and on acceptance Stripe creates the committed subscription + first invoice. The
-- Stripe operations live in Supabase edge functions; these columns hold the references they write
-- back. Twin of Supabase migration 20260703000000_procurement_stripe_quote.sql.

ALTER TABLE stirling_pdf.procurement_quote
    ADD COLUMN IF NOT EXISTS stripe_quote_id    VARCHAR(128),
    ADD COLUMN IF NOT EXISTS stripe_invoice_url TEXT;
