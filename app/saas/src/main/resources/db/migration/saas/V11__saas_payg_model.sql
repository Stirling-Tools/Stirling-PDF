-- PAYG data model: pricing policy, processing jobs + lineage, wallet ledger, wallet policy,
-- entitlement snapshots, shadow-mode comparison rows, plus a payg_team_extensions sidecar table
-- carrying team-level PAYG fields, and a cap_units column on team_memberships.
--
-- Sidecar pattern (mirrors saas_team_extensions): PAYG-only team fields don't sit directly on
-- `teams`, so OSS deployments running Hibernate ddl-auto=update against the proprietary Team
-- entity never see PAYG columns they don't have entities for.
--
-- Everything is purely additive. No existing rows are modified, no columns are dropped.

-- ---------------------------------------------------------------------------------------------
-- 1. pricing_policy — versioned economic config (units, lifecycle metadata).
--    step_limits and stripe_price_ids live on normalised child tables below — typed columns, no
--    JSON parsing, queryable directly.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pricing_policy (
    policy_id            BIGSERIAL    PRIMARY KEY,
    version              VARCHAR(32)  NOT NULL UNIQUE,
    effective_from       TIMESTAMP    NOT NULL,
    effective_to         TIMESTAMP,
    doc_pages_per_unit   INTEGER      NOT NULL,
    doc_bytes_per_unit   BIGINT       NOT NULL,
    min_charge_units     INTEGER      NOT NULL DEFAULT 1,
    file_unit_cap        INTEGER      NOT NULL DEFAULT 1000,
    is_default           BOOLEAN      NOT NULL DEFAULT FALSE,
    notes                TEXT,
    created_by           VARCHAR(255),
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_policy_default
    ON pricing_policy (is_default) WHERE is_default = TRUE;

-- Max steps allowed per process for each caller surface (JobSource).
CREATE TABLE IF NOT EXISTS pricing_policy_step_limit (
    policy_id    BIGINT       NOT NULL REFERENCES pricing_policy(policy_id) ON DELETE CASCADE,
    job_source   VARCHAR(32)  NOT NULL,
    step_limit   INTEGER      NOT NULL,
    PRIMARY KEY (policy_id, job_source)
);

-- Stripe Price IDs this policy resolves to, one per supported currency. Currency itself isn't
-- stored here — it lives on stripe.prices.currency and is looked up via Sync Engine when picking
-- the right Price for a customer's subscription. All prices in one policy must share the same
-- Billing Meter and the same first-tier upper bound in units (deploy-time CI check).
CREATE TABLE IF NOT EXISTS pricing_policy_stripe_price (
    policy_id          BIGINT       NOT NULL REFERENCES pricing_policy(policy_id) ON DELETE CASCADE,
    stripe_price_id    VARCHAR(128) NOT NULL,
    PRIMARY KEY (policy_id, stripe_price_id)
);

-- ---------------------------------------------------------------------------------------------
-- 2. payg_team_extensions — sidecar carrying PAYG-only team fields. 1:1 with teams via shared PK.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payg_team_extensions (
    team_id              BIGINT       PRIMARY KEY REFERENCES teams(team_id) ON DELETE CASCADE,
    pricing_policy_id    BIGINT       REFERENCES pricing_policy(policy_id),
    stripe_customer_id   VARCHAR(128) UNIQUE,
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version              BIGINT       NOT NULL DEFAULT 0
);

COMMENT ON COLUMN payg_team_extensions.pricing_policy_id IS
    'Override policy for this team. NULL means use the row in pricing_policy with is_default=TRUE.';
COMMENT ON COLUMN payg_team_extensions.stripe_customer_id IS
    'Stripe customer id for this team. Eager-created so every team has billing identity on file.';

-- ---------------------------------------------------------------------------------------------
-- 3. team_memberships column addition: optional per-member sub-cap. Lives directly on the table
-- because team_memberships is already a SaaS-only table.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE team_memberships
    ADD COLUMN IF NOT EXISTS cap_units BIGINT;
COMMENT ON COLUMN team_memberships.cap_units IS
    'Per-period spend cap for this member inside their team wallet, in doc units. NULL = no member-level cap.';

-- ---------------------------------------------------------------------------------------------
-- 4. processing_job — one billable process; step_count and last_step_at track the workflow window.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS processing_job (
    job_id                 UUID         PRIMARY KEY,
    owner_user_id          BIGINT       NOT NULL,
    owner_team_id          BIGINT,
    process_type           VARCHAR(32)  NOT NULL,
    source                 VARCHAR(32)  NOT NULL,
    document_fingerprint   VARCHAR(64),
    doc_units              INTEGER      NOT NULL DEFAULT 0,
    step_count             INTEGER      NOT NULL DEFAULT 0,
    started_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_step_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at              TIMESTAMP,
    policy_id              BIGINT       NOT NULL REFERENCES pricing_policy(policy_id),
    charged_units          INTEGER,
    charged_cents          INTEGER,
    status                 VARCHAR(32)  NOT NULL,
    idempotency_key        VARCHAR(128) UNIQUE,
    metadata               JSONB
);

CREATE INDEX IF NOT EXISTS idx_processing_job_owner_open
    ON processing_job (owner_user_id, status) WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS idx_processing_job_last_step
    ON processing_job (status, last_step_at) WHERE status = 'OPEN';

-- ---------------------------------------------------------------------------------------------
-- 5. processing_job_step — per-tool-call audit within a job.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS processing_job_step (
    step_id         BIGSERIAL    PRIMARY KEY,
    job_id          UUID         NOT NULL REFERENCES processing_job(job_id) ON DELETE CASCADE,
    tool_id         VARCHAR(128) NOT NULL,
    status          VARCHAR(32)  NOT NULL,
    started_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at    TIMESTAMP,
    input_pages     INTEGER,
    input_bytes     BIGINT,
    error_code      VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_processing_job_step_job
    ON processing_job_step (job_id);

-- ---------------------------------------------------------------------------------------------
-- 6. job_artifact_hash — per-step input/output content hashes used by the lineage detector.
-- ---------------------------------------------------------------------------------------------
-- content_hash holds "type:value" signature keys; VARCHAR(128) fits SHA-256 and future schemes.
CREATE TABLE IF NOT EXISTS job_artifact_hash (
    job_id        UUID          NOT NULL REFERENCES processing_job(job_id) ON DELETE CASCADE,
    content_hash  VARCHAR(128)  NOT NULL,
    kind          VARCHAR(8)    NOT NULL,
    created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (job_id, content_hash, kind)
);

CREATE INDEX IF NOT EXISTS idx_artifact_hash_lookup
    ON job_artifact_hash (content_hash, created_at);

-- ---------------------------------------------------------------------------------------------
-- 7. wallet_ledger — append-only signed-amount ledger keyed on team_id.
-- amount_units is INTEGER (per-row delta, always small); cap and rollup columns are BIGINT
-- because they accumulate across a billing period.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_ledger (
    entry_id           BIGSERIAL    PRIMARY KEY,
    team_id            BIGINT       NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    actor_user_id      BIGINT,
    entry_type         VARCHAR(32)  NOT NULL,
    bucket             VARCHAR(16)  NOT NULL,
    amount_units       INTEGER      NOT NULL,
    reference_type     VARCHAR(32)  NOT NULL,
    reference_id       VARCHAR(128) NOT NULL,
    policy_id          BIGINT,
    stripe_event_id    VARCHAR(128),
    occurred_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata           JSONB
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_team
    ON wallet_ledger (team_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_actor
    ON wallet_ledger (team_id, actor_user_id, occurred_at) WHERE actor_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_ledger_ref
    ON wallet_ledger (reference_type, reference_id, entry_type, bucket);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_ledger_stripe_event
    ON wallet_ledger (stripe_event_id) WHERE stripe_event_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- 8. wallet_policy — per-team charging engine, cap, degradation rules, lineage strategy.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_policy (
    policy_id              BIGSERIAL    PRIMARY KEY,
    team_id                BIGINT       NOT NULL UNIQUE REFERENCES teams(team_id) ON DELETE CASCADE,
    engine                 VARCHAR(16)  NOT NULL DEFAULT 'LEGACY',
    cap_period             VARCHAR(16)  NOT NULL DEFAULT 'CALENDAR_MONTH',
    cap_units              BIGINT,
    -- Customer's money intent ("I want $50/month"); the currency comes from the team's Stripe
    -- customer at recompute time, not stored separately here.
    cap_source_money       BIGINT,
    warn_at_pct            INTEGER      NOT NULL DEFAULT 80,
    degrade_at_pct         INTEGER      NOT NULL DEFAULT 100,
    degraded_feature_set   VARCHAR(32)  NOT NULL DEFAULT 'MINIMAL',
    auto_group_strategy    VARCHAR(16)  NOT NULL DEFAULT 'AUTO',
    notification_emails    JSONB        NOT NULL DEFAULT '[]'::jsonb,
    updated_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------------------------
-- 9. wallet_entitlement_snapshot — hot-path state for the entitlement guard.
--    user_id = 0 is the team-wide sentinel (Postgres treats NULL as not-equal-to-NULL in unique
--    constraints, so 0 is the cleaner choice for a composite PK).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_entitlement_snapshot (
    team_id               BIGINT       NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    user_id               BIGINT       NOT NULL DEFAULT 0,
    period_start          TIMESTAMP    NOT NULL,
    period_end            TIMESTAMP    NOT NULL,
    period_spend_units    BIGINT       NOT NULL DEFAULT 0,
    period_cap_units      BIGINT,
    state                 VARCHAR(16)  NOT NULL DEFAULT 'FULL',
    feature_set           VARCHAR(32)  NOT NULL DEFAULT 'FULL',
    enabled_gates         JSONB        NOT NULL DEFAULT '[]'::jsonb,
    computed_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, user_id)
);

-- ---------------------------------------------------------------------------------------------
-- 10. payg_shadow_charge — per-job legacy-vs-PAYG diff during PAYG_SHADOW engine mode.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payg_shadow_charge (
    shadow_id                BIGSERIAL    PRIMARY KEY,
    team_id                  BIGINT       NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    job_id                   UUID         NOT NULL,
    policy_id                BIGINT       NOT NULL REFERENCES pricing_policy(policy_id),
    payg_units               INTEGER      NOT NULL,
    legacy_credits_charged   INTEGER      NOT NULL,
    diff_pct                 INTEGER      NOT NULL,
    occurred_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payg_shadow_team_time
    ON payg_shadow_charge (team_id, occurred_at);
