-- Direct PDF link for a procurement quote's first invoice (Stripe invoice_pdf), stored at accept
-- alongside stripe_invoice_url so the portal's "Download invoice" button survives a reload instead
-- of relying on the transient accept response. Written by the accept edge function via the
-- procurement_set_quote_accepted RPC; read by the Java backend via JPA. A Supabase twin mirrors it.

ALTER TABLE stirling_pdf.procurement_quote
    ADD COLUMN IF NOT EXISTS stripe_invoice_pdf TEXT;
