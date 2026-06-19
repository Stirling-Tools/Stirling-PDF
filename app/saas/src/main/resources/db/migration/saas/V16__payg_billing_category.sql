-- PAYG analytics axis: stamp every billable ledger entry / shadow row with the category that
-- produced it (API | AI | AUTOMATION | BYPASSED). PAYG stays on a single flat-priced Stripe meter
-- forever — this column is for in-app breakdowns and analytics, never for Stripe pricing.
--
-- All adds are nullable: pre-V16 rows have no category and stay NULL; the interceptor populates
-- it for new rows going forward.

-- ---------------------------------------------------------------------------------------------
-- 1. wallet_ledger.billing_category
-- ---------------------------------------------------------------------------------------------
ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS billing_category VARCHAR(16) NULL;
COMMENT ON COLUMN wallet_ledger.billing_category IS
    'API | AI | AUTOMATION | BYPASSED. NULL = system entry or pre-V16 backfill.';

-- Partial index — only billable rows ever read this column, and NULLs would just bloat the tree.
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_team_category_period
    ON wallet_ledger (team_id, billing_category, occurred_at)
    WHERE billing_category IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- 2. payg_shadow_charge.billing_category + job_source
-- ---------------------------------------------------------------------------------------------
ALTER TABLE payg_shadow_charge
    ADD COLUMN IF NOT EXISTS billing_category VARCHAR(16) NULL,
    ADD COLUMN IF NOT EXISTS job_source       VARCHAR(32) NULL;

-- Backfill job_source from processing_job (best-effort — rows whose job has already been pruned
-- stay NULL, which is fine: the shadow row is self-describing post-V16 and only legacy ones lack
-- the column.)
UPDATE payg_shadow_charge sc
   SET job_source = pj.source
  FROM processing_job pj
 WHERE pj.job_id = sc.job_id
   AND sc.job_source IS NULL;

-- ---------------------------------------------------------------------------------------------
-- 3. pricing_policy_stripe_price.stripe_product_id
--    Operator populates this manually per row when seeding new policies. Nullable for backward
--    compatibility with existing rows that don't carry a Product reference.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE pricing_policy_stripe_price
    ADD COLUMN IF NOT EXISTS stripe_product_id VARCHAR(128) NULL;

-- ---------------------------------------------------------------------------------------------
-- 4. wallet_category_summary view — pre-grouped per-team, per-month, per-category aggregate that
--    the in-app breakdown widget reads. Recomputed live on every SELECT; cheap thanks to the
--    partial index above.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW wallet_category_summary AS
SELECT
    team_id,
    date_trunc('month', occurred_at) AS period_start,
    billing_category,
    SUM(CASE WHEN amount_units < 0 THEN -amount_units ELSE 0 END) AS units_debited,
    COUNT(*) FILTER (WHERE entry_type = 'DEBIT')                  AS debit_count
FROM wallet_ledger
WHERE billing_category IS NOT NULL
GROUP BY team_id, date_trunc('month', occurred_at), billing_category;
