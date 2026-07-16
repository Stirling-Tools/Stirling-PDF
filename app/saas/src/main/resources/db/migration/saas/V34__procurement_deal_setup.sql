-- Deployment target + seat count captured at the trial-start step (the setup dialog the demo shows
-- before a trial begins), stored on the deal so the quote builder seeds from the buyer's real
-- environment instead of a hardcoded default. deployment: cloud | selfhost | airgap. seats: 0 =
-- unspecified. Written and read by the Java backend via JPA. A Supabase twin migration mirrors it.

ALTER TABLE stirling_pdf.procurement_deal
    ADD COLUMN IF NOT EXISTS deployment VARCHAR(16) NOT NULL DEFAULT 'cloud';

ALTER TABLE stirling_pdf.procurement_deal
    ADD COLUMN IF NOT EXISTS seats INTEGER NOT NULL DEFAULT 0;
