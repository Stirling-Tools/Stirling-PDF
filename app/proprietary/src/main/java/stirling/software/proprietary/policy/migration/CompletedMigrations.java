package stirling.software.proprietary.policy.migration;

/**
 * Tracks which one-time policy-subsystem migrations have finished, so a migration can skip its
 * every-boot scan once done. {@link JpaCompletedMigrations} is the runtime bean; {@link
 * InProcessCompletedMigrations} backs tests.
 */
public interface CompletedMigrations {

    /** Whether the migration with this id has already been recorded as complete. */
    boolean isDone(String id);

    /**
     * Record the migration as complete. Safe to call concurrently: a race on first boot leaves the
     * marker recorded exactly once and never propagates a failure to the caller.
     */
    void markDone(String id);
}
