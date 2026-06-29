-- Per-(team, billing period, category) last-seen cumulative usage reported by a linked self-hosted
-- instance (combined-billing "Mode A"). The instance reports monotonic cumulative unit totals on
-- its daily sync; SaaS bills the DELTA since the last sync — idempotent (a resend bills nothing) and
-- tamper-evident (a counter that drops is a signal) — by reusing the standard charge path
-- (JobChargeService.chargeStandalone), so no separate billing logic exists for this flow.
--
-- Inert until release: written only by the InstanceController /sync endpoint, gated behind
-- stirling.billing.account-link.enabled (default off). Additive, idempotent table.

CREATE TABLE IF NOT EXISTS stirling_pdf.payg_instance_usage (
    id                    BIGSERIAL    PRIMARY KEY,
    team_id               BIGINT       NOT NULL REFERENCES stirling_pdf.teams(team_id) ON DELETE CASCADE,
    period_start          TIMESTAMP    NOT NULL,
    category              VARCHAR(32)  NOT NULL,
    -- Highest cumulative unit total seen for this (team, period, category); the next sync bills
    -- (reported cumulative - this).
    last_cumulative_units BIGINT       NOT NULL DEFAULT 0,
    -- Highest sync sequence applied; a sync at or below this is a replay and is ignored.
    last_sync_seq         BIGINT       NOT NULL DEFAULT 0,
    updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_payg_instance_usage UNIQUE (team_id, period_start, category)
);

CREATE INDEX IF NOT EXISTS idx_payg_instance_usage_team
    ON stirling_pdf.payg_instance_usage (team_id);

COMMENT ON TABLE stirling_pdf.payg_instance_usage IS
    'Last-seen cumulative usage per (team, billing period, category) reported by linked self-hosted '
    'instances (combined-billing Mode A). SaaS bills the delta vs last_cumulative_units via the '
    'standard charge path; last_sync_seq dedups replays.';
