-- Policy posture (runs per PDF) on the quote: the D71 meter is denominated in runs, so a quote
-- must remember the posture it was priced at (Essentials 2, Governed 4, Regulated 7). Defaults to
-- Governed (4). Written and read by the Java backend via JPA. A Supabase twin migration mirrors it.

ALTER TABLE stirling_pdf.procurement_quote
    ADD COLUMN IF NOT EXISTS intensity INTEGER NOT NULL DEFAULT 4;
