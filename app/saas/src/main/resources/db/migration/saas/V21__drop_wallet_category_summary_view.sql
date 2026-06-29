-- Drop the unused wallet_category_summary view.
--
-- V16 created this view to back the wallet's per-category spend breakdown via
-- WalletCategorySummaryDao. That DAO was never wired up — the breakdown is built from the JPA
-- repository (WalletLedgerRepository.sumPeriodAmountByCategory) instead — so both the DAO and this
-- view have zero readers. The DAO is deleted in the same change; this drops the dead view.
--
-- Done as a new migration (not by editing V16) so Flyway's checksum validation doesn't fail on
-- databases that already applied V16. IF EXISTS keeps it safe on DBs where V16 hasn't run.

DROP VIEW IF EXISTS stirling_pdf.wallet_category_summary;
