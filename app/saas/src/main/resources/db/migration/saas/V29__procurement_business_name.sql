-- Persist the buyer's company name on the quote so re-editing remembers it and it can be shown on
-- the quote/agreement. Twin of Supabase migration 20260705000000_procurement_business_name.sql.

ALTER TABLE stirling_pdf.procurement_quote
    ADD COLUMN IF NOT EXISTS business_name VARCHAR(255);
