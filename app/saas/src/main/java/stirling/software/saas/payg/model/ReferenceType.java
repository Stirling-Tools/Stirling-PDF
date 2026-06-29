package stirling.software.saas.payg.model;

/** What a {@code wallet_ledger.reference_id} points at. */
public enum ReferenceType {
    JOB,
    INVOICE,
    STRIPE_EVENT,
    ADMIN,
    /** A linked self-hosted instance's daily usage sync (combined-billing "Mode A"). */
    INSTANCE_SYNC
}
