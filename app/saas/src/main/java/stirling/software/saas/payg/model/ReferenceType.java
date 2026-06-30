package stirling.software.saas.payg.model;

/** What a {@code wallet_ledger.reference_id} points at. */
public enum ReferenceType {
    JOB,
    INVOICE,
    STRIPE_EVENT,
    ADMIN
}
