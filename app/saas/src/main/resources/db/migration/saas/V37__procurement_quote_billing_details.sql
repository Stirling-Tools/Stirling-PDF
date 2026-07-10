-- Buyer / AP details captured on the quote's "Your details" step: the signatory contact and a
-- billing address, plus a PO number and tax id for the invoice. All optional (never gate quote
-- generation). Persisted so the quote re-seeds the builder on a re-edit and so the issue edge
-- function can put them on the Stripe customer (name + bill-to address) and invoice (PO / tax id
-- as custom fields). Country and currency are intentionally out of scope for now. Written and read
-- by the Java backend via JPA. A Supabase twin mirrors these columns.

ALTER TABLE stirling_pdf.procurement_quote
    ADD COLUMN IF NOT EXISTS contact_name  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS city          VARCHAR(128),
    ADD COLUMN IF NOT EXISTS region        VARCHAR(128),
    ADD COLUMN IF NOT EXISTS postal_code   VARCHAR(32),
    ADD COLUMN IF NOT EXISTS po_number     VARCHAR(128),
    ADD COLUMN IF NOT EXISTS tax_id        VARCHAR(64);
