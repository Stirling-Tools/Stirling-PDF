package stirling.software.saas.payg.model;

public enum LedgerEntryType {
    CYCLE_GRANT,
    DEBIT,
    REFUND,
    EXPIRE,
    OVERAGE_REPORTED,
    ADJUSTMENT,
    LEGACY_BACKFILL
}
