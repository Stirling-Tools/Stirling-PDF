package stirling.software.proprietary.policy.engine;

/**
 * How thorough a policy sweep is. Triggers that do a complete listing anyway (reconcile, schedule,
 * manual) run {@link #FULL}, which also stamps presence and prunes ledger rows for files that are
 * gone. Event-driven triggers run {@link #LIGHT} on every file drop, so the per-event cost stays
 * proportional to what changed instead of the folder size; the periodic FULL sweep does the
 * hygiene.
 */
public enum SweepKind {
    FULL,
    LIGHT
}
