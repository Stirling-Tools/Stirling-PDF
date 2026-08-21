package stirling.software.proprietary.policy.ledger;

/**
 * A row's claim-relevant state as read by {@link ProcessedLedger#statesFor}: what a sweep observed
 * before deciding a claim. May be stale by the time the claim runs; every ledger transition
 * re-checks the observed state in its WHERE clause, so staleness defers a claim to a later sweep
 * rather than double-running one.
 */
public record ClaimState(ProcessedFileStatus status, String gate, String contentHash) {}
