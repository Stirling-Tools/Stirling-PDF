-- Offline / air-gapped licence add-on flag on the quote (a paid add-on; priced like QBR). Written
-- and read by the Java backend via JPA. Twin of Supabase migration
-- 20260710000000_procurement_offline_license.sql.

ALTER TABLE stirling_pdf.procurement_quote
    ADD COLUMN IF NOT EXISTS offline_license BOOLEAN NOT NULL DEFAULT false;
