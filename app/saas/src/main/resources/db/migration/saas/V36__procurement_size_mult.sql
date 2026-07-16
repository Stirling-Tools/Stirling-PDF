-- File-size tier multiplier on the quote (D93): larger, image-heavy PDFs cost more, so the buyer
-- picks a size tier (Compact 1.0 / Standard 1.4 / Heavy 2.4) that scales the per-run rate. Persisted
-- so the quote re-prices and re-seeds the builder consistently. Defaults to 1.0 (no uplift) for rows
-- that predate the column. Written and read by the Java backend via JPA. A Supabase twin mirrors it.

ALTER TABLE stirling_pdf.procurement_quote
    ADD COLUMN IF NOT EXISTS size_mult DOUBLE PRECISION NOT NULL DEFAULT 1.0;
