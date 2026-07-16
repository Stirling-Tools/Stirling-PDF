-- PAYG size-scaled billing: run-scoped grouping + per-input-file counting.
--
-- Two independent axes now live on a charge:
--   * doc_units  — billing quantity, scales with file size (existing column)
--   * doc_count  — number of INPUT files (the "unique PDFs" dimension); a split (1→many) stays 1,
--                  a merge (N→1) is N. Fixed at open; joined steps never change it.
-- Plus run_id, the automation-run correlation id used to group a run's tool sub-steps into one
-- charge (replacing the old content+time-window grouping) and to keep two separate runs distinct.
--
-- Everything is additive; no existing rows are modified, no columns dropped.

-- ── processing_job ───────────────────────────────────────────────────────────
ALTER TABLE processing_job ADD COLUMN IF NOT EXISTS run_id VARCHAR(64);
ALTER TABLE processing_job ADD COLUMN IF NOT EXISTS doc_count INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN processing_job.run_id IS
    'Automation-run correlation id (X-Stirling-Run-Id); NULL for a standalone tool call. Lineage '
    'joins are scoped to one run_id, so separate runs never merge even on identical bytes.';
COMMENT ON COLUMN processing_job.doc_count IS
    'Number of input files this charge represents (the count dimension, distinct from size-scaled '
    'doc_units). Split=1, merge=N. Fixed at open.';

-- ── wallet_ledger ────────────────────────────────────────────────────────────
-- Denormalise the count dimension + input fingerprint onto the DEBIT row so usage analytics
-- (unique PDFs, per-category counts, size-multiplier average) query one table and survive
-- processing_job pruning.
ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS doc_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE wallet_ledger ADD COLUMN IF NOT EXISTS document_fingerprint VARCHAR(64);

COMMENT ON COLUMN wallet_ledger.doc_count IS
    'Input-file count for this entry (mirrors processing_job.doc_count); summed for "PDFs processed".';
COMMENT ON COLUMN wallet_ledger.document_fingerprint IS
    'SHA-256 of the entry''s input file set; COUNT(DISTINCT ...) gives unique PDFs. NULL for '
    'aggregate/system entries (e.g. linked-instance sync).';

-- Distinct-PDF + size-multiplier queries scan by team + period.
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_team_period_fp
    ON wallet_ledger (team_id, occurred_at, document_fingerprint)
    WHERE document_fingerprint IS NOT NULL;
