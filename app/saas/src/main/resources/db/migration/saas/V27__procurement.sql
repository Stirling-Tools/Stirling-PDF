-- Enterprise procurement: the tables that track a linked team's journey from trial to live.
--
-- One deal per team (the commercial journey: trial -> quote -> agreement -> payment -> live), the
-- quotes built against it (the itemised, priced offers), and an append-only activity log for the
-- money/licence-touching actions. The resulting subscription is mirrored in billing_subscriptions
-- (seeded on trial start / payment); the entitlement that unlocks the product is a Keygen licence
-- referenced by procurement_deal.license_ref. Prices are computed server-side (ProcurementPricingService).
--
-- Additive and idempotent (IF NOT EXISTS) — safe on the shared dev branch.

CREATE TABLE IF NOT EXISTS stirling_pdf.procurement_deal (
    deal_id               BIGSERIAL    PRIMARY KEY,
    team_id               BIGINT       NOT NULL UNIQUE REFERENCES stirling_pdf.teams(team_id) ON DELETE CASCADE,
    -- one active deal per team; the journey lives on this row.
    stage                 VARCHAR(32)  NOT NULL DEFAULT 'trial',
    -- trial | quote | security (agreement) | procurement (payment) | active (live)
    trial_started_at      TIMESTAMP,
    trial_ends_at         TIMESTAMP,
    trial_extensions_used INT          NOT NULL DEFAULT 0,
    license_ref           VARCHAR(128),
    -- Keygen licence id issued for this deal (trial or annual). Mocked until Keygen mgmt lands.
    subscription_id       VARCHAR(255),
    -- Stripe subscription id, mirrored into billing_subscriptions once commercial.
    accepted_quote_id     BIGINT,
    created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version               BIGINT       NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stirling_pdf.procurement_quote (
    quote_id            BIGSERIAL    PRIMARY KEY,
    deal_id             BIGINT       NOT NULL REFERENCES stirling_pdf.procurement_deal(deal_id) ON DELETE CASCADE,
    quote_number        VARCHAR(64)  NOT NULL,
    status              VARCHAR(24)  NOT NULL DEFAULT 'draft',
    -- draft | sent | accepted | expired
    currency            VARCHAR(8)   NOT NULL DEFAULT 'USD',
    volume              BIGINT       NOT NULL,
    seats               INT,
    deployment          VARCHAR(24),
    term_years          INT          NOT NULL,
    service_level       VARCHAR(24)  NOT NULL,
    indemnification     BOOLEAN      NOT NULL DEFAULT FALSE,
    training            BOOLEAN      NOT NULL DEFAULT FALSE,
    qbr                 BOOLEAN      NOT NULL DEFAULT FALSE,
    annual_net_minor    BIGINT       NOT NULL,
    -- recurring annual fee after the multi-year discount, in minor units (cents).
    tcv_minor           BIGINT       NOT NULL,
    -- total contract value across the term incl. one-time fees, minor units.
    line_items          TEXT,
    -- JSON snapshot of the itemised lines the order form renders.
    stripe_price_id     VARCHAR(128),
    checkout_session_id VARCHAR(255),
    checkout_url        TEXT,
    valid_until         DATE,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version             BIGINT       NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stirling_pdf.procurement_activity (
    activity_id   BIGSERIAL    PRIMARY KEY,
    deal_id       BIGINT       NOT NULL REFERENCES stirling_pdf.procurement_deal(deal_id) ON DELETE CASCADE,
    actor_user_id BIGINT,
    -- the internal/portal user who took the action; informational (no FK).
    action        VARCHAR(48)  NOT NULL,
    -- trial_started | trial_extended | quote_built | quote_accepted | checkout_created | went_live ...
    detail        TEXT,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_procurement_quote_deal ON stirling_pdf.procurement_quote (deal_id);
CREATE INDEX IF NOT EXISTS idx_procurement_activity_deal ON stirling_pdf.procurement_activity (deal_id);
