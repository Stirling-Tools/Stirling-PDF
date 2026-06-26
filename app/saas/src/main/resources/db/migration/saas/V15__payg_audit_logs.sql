-- PAYG audit-log tables. Two append-only logs:
--
--   * payg_meter_event_log         — written by the backend's PaygMeterReportingService
--                                    on every Stripe meter event POST attempt. Gives us a
--                                    record independent of Stripe's own logs so we can
--                                    replay-after-24h-window (Stripe's idempotency window)
--                                    and run nightly reconciliation against Stripe's
--                                    meter-event list.
--
--   * payg_subscription_change_log — written by V14's two RPC functions on every
--                                    subscription link / unlink. Independent of Stripe's
--                                    webhook log; lets us diagnose "why is this team in
--                                    free-tier-block when their Stripe sub is active?"
--                                    without leaving our DB.
--
-- Both are pure additive; nothing reads them yet. PR-SB-5 (nightly reconcile) wires the
-- meter-event log; the subscription change log is queried only from admin tooling.
--
-- Design references:
--   * payg-stripe-supabase-plan.html §3.10 — twin migrations
--   * payg-stripe-supabase-plan.html §8 H5 — 24h idempotency window mitigation

-- ---------------------------------------------------------------------------------------------
-- 1. payg_meter_event_log — backend-side audit of every Stripe meter event we tried to post.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stirling_pdf.payg_meter_event_log (
    event_id            BIGSERIAL    PRIMARY KEY,
    team_id             BIGINT       NOT NULL REFERENCES stirling_pdf.teams(team_id) ON DELETE CASCADE,
    job_id              UUID,
    idempotency_key     VARCHAR(128) NOT NULL UNIQUE,
    units               INTEGER      NOT NULL,
    occurred_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    posted_to_stripe_at TIMESTAMP,
    -- NULL while pending; set when the meter-payg-units edge fn returns success. NULL after
    -- 24h means the event never made it to Stripe — nightly reconcile retries with a fresh
    -- idempotency-key suffix (see §8 H5 mitigation).
    stripe_error_code   VARCHAR(64),
    stripe_error_body   TEXT,
    metadata            JSONB
);

CREATE INDEX IF NOT EXISTS idx_payg_meter_event_team_time
    ON stirling_pdf.payg_meter_event_log (team_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_payg_meter_event_unposted
    ON stirling_pdf.payg_meter_event_log (occurred_at)
    WHERE posted_to_stripe_at IS NULL;

COMMENT ON TABLE stirling_pdf.payg_meter_event_log IS
    'Backend audit of every Stripe meter event POST attempt. Independent of Stripe meter '
    'history. idempotency_key is the same one passed to Stripe; the UNIQUE constraint here '
    'gives us safe at-least-once semantics even on backend retry. Rows older than 24h with '
    'posted_to_stripe_at IS NULL are stuck and retried by the nightly reconcile job.';

-- ---------------------------------------------------------------------------------------------
-- 2. payg_subscription_change_log — written by V14's RPC functions on every link / unlink.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stirling_pdf.payg_subscription_change_log (
    change_id        BIGSERIAL    PRIMARY KEY,
    team_id          BIGINT       NOT NULL REFERENCES stirling_pdf.teams(team_id) ON DELETE CASCADE,
    action           VARCHAR(32)  NOT NULL,
    -- LINKED   — payg_link_subscription written subscription_id
    -- UNLINKED — payg_unlink_subscription cleared the subscription
    subscription_id  VARCHAR(128),
    reason           TEXT,
    changed_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payg_sub_change_team_time
    ON stirling_pdf.payg_subscription_change_log (team_id, changed_at);

COMMENT ON TABLE stirling_pdf.payg_subscription_change_log IS
    'Append-only log of every subscription link / unlink. Written by V14 RPC functions; '
    'never updated. Diagnostic value when reconciling against Stripe webhook history.';
