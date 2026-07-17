-- PAYG prepaid-bundle QUOTE object — a persisted, editable, customer-facing proforma.
--
-- Buyers who need quote-based billing produce a quote first, then either check out (card, immediate)
-- or take the invoice/PO route (settled later). Capacity is awarded ONLY when payment is received,
-- never on quote creation/acceptance. A first-class object (quote number, status lifecycle, validity
-- window, PDF), NOT the throwaway checkout-ticket that was torn out earlier (V40 split).
--
-- Java never reads or writes this table: quotes are created/settled through the edge-fn RPCs
-- (public.payg_upsert_bundle_quote / _get_bundle_quote / _mark_bundle_quote_paid, Supabase-only). This
-- Flyway twin exists only to keep the main-repo schema authority in sync (dual-schema authoring), so
-- there is deliberately NO JPA entity + no RPC bodies here.
--
-- Twin of Stirling-PDF-SaaS/supabase/migrations/20260728000000_payg_bundle_quote_object.sql (table
-- only). Keep in sync.

CREATE TABLE IF NOT EXISTS stirling_pdf.payg_bundle_quote (
    quote_id                    BIGSERIAL     PRIMARY KEY,
    quote_number                VARCHAR(32)   NOT NULL UNIQUE,
    team_id                     BIGINT        NOT NULL,
    status                      VARCHAR(16)   NOT NULL DEFAULT 'issued'
        CHECK (status IN ('draft', 'issued', 'paid', 'expired', 'void')),
    users                       INTEGER,
    posture_policies            SMALLINT      NOT NULL,
    size_mult                   NUMERIC(4,2)  NOT NULL,
    pipeline_mult               SMALLINT      NOT NULL,
    provisioned_monthly_volume  BIGINT,
    pool_credits                BIGINT        NOT NULL,
    price_minor                 BIGINT,
    currency                    VARCHAR(8),
    consented_at                TIMESTAMP,
    eula_version                VARCHAR(64),
    stripe_ref                  VARCHAR(128),
    paid_at                     TIMESTAMP,
    valid_until                 TIMESTAMP     NOT NULL,
    created_at                  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payg_bundle_quote_team
    ON stirling_pdf.payg_bundle_quote (team_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payg_bundle_quote_stripe_ref
    ON stirling_pdf.payg_bundle_quote (stripe_ref)
    WHERE stripe_ref IS NOT NULL;

COMMENT ON TABLE stirling_pdf.payg_bundle_quote IS
    'Persisted prepaid-bundle quotes (proforma). Capacity is credited on payment, never on creation; '
    'status: draft->issued->paid|expired|void. pool_credits is the Stripe line quantity. Written only '
    'by the edge-fn RPCs (no JPA entity).';
