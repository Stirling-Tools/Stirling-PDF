package stirling.software.proprietary.policy.engine;

/**
 * How thorough a policy sweep is: {@link #FULL} (complete listing; also stamps presence and prunes
 * the ledger), {@link #LIGHT} (event-driven; claims only, cost proportional to what changed), or
 * {@link #USER} (a person asked — a full sweep that also retries files parked by an earlier
 * failure, since the click usually follows fixing whatever failed them).
 */
public enum SweepKind {
    FULL,
    LIGHT,
    USER
}
