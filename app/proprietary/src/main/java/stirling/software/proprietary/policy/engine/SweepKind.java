package stirling.software.proprietary.policy.engine;

/**
 * How thorough a policy sweep is: {@link #FULL} (complete listing; also stamps presence and prunes
 * the ledger) or {@link #LIGHT} (event-driven; claims only, cost proportional to what changed).
 */
public enum SweepKind {
    FULL,
    LIGHT
}
