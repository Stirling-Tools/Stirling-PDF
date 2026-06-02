-- Refund tracking on shadow rows. Shadow models the eventual Stripe meter_event_adjustment(cancel)
-- by flipping status from CHARGED to REFUNDED in the same request's afterCompletion when a
-- freshly-opened process fails with 5xx on its first step.
--
-- Reconciliation report selects SUM(payg_units) WHERE status = 'CHARGED' to get the true net
-- Stripe would bill.

ALTER TABLE payg_shadow_charge
    ADD COLUMN IF NOT EXISTS status         VARCHAR(16)  NOT NULL DEFAULT 'CHARGED',
    ADD COLUMN IF NOT EXISTS refunded_at    TIMESTAMP,
    ADD COLUMN IF NOT EXISTS refund_reason  VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_payg_shadow_status_time
    ON payg_shadow_charge (status, occurred_at);

-- Hot-path index for findFirstByJobIdOrderByIdAsc: hit on every 5xx-first-step refund to flip
-- the row to REFUNDED. UNIQUE because at most one shadow row exists per processing_job by
-- construction (openProcess writes exactly one on OPENED, zero on JOINED).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payg_shadow_job_id
    ON payg_shadow_charge (job_id);
