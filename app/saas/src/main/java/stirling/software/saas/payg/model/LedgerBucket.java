package stirling.software.saas.payg.model;

/** Which pool a ledger entry touches. Debits flow CYCLE → BOUGHT → OVERAGE in that order. */
public enum LedgerBucket {
    CYCLE,
    BOUGHT,
    OVERAGE
}
