-- Persist the first post-term renewal fee (annual net + one CPI step) computed at quote time, so the
-- figure shown to the buyer is locked to what they were quoted rather than recomputed from the
-- current rate card on every read. Minor units. Written and read by the Java backend via JPA; a
-- Supabase twin migration mirrors it.

ALTER TABLE stirling_pdf.procurement_quote
    ADD COLUMN IF NOT EXISTS renewal_annual_minor BIGINT NOT NULL DEFAULT 0;
