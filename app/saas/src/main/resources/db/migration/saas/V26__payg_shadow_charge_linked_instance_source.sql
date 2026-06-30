-- Twin of supabase/migrations/<ts>_payg_shadow_charge_linked_instance_source.sql (Stirling-PDF-SaaS).
-- Keep byte-identical to the Supabase twin.
--
-- Widen the payg_shadow_charge.job_source CHECK to allow LINKED_INSTANCE (combined-billing "Mode
-- A"). A linked instance's daily-sync charge runs through JobChargeService.chargeStandalone, which
-- writes a payg_shadow_charge row with job_source=LINKED_INSTANCE — a JobSource value added after
-- the original constraint, so the insert was failing the check and 500ing POST /api/v1/instance/sync.
--
-- Idempotent (DROP IF EXISTS + ADD, so it survives being applied by both the Flyway and Supabase
-- migration sets against the same schema) and additive (the new set is a superset of the JobSource
-- enum; the app only ever writes enum values, so no existing row can violate it).

ALTER TABLE stirling_pdf.payg_shadow_charge
    DROP CONSTRAINT IF EXISTS payg_shadow_charge_job_source_check;

ALTER TABLE stirling_pdf.payg_shadow_charge
    ADD CONSTRAINT payg_shadow_charge_job_source_check
        CHECK (job_source IS NULL
               OR job_source IN ('WEB', 'API', 'PIPELINE', 'DESKTOP_APP', 'LINKED_INSTANCE'));
