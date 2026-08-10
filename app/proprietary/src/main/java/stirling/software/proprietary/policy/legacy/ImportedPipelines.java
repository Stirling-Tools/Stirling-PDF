package stirling.software.proprietary.policy.legacy;

/**
 * Tombstones for legacy pipeline configs that have already been converted into policies, keyed by a
 * stable import key. A config is converted at most once ever: the marker outlives the policy it
 * created, so deleting that policy is permanent even though the JSON file stays on disk.
 *
 * <p>Deliberately separate from {@code CompletedMigrations}: clearing a migration marker to re-run
 * a migration is a reasonable operator action, whereas clearing these would resurrect automations
 * the user deleted on purpose.
 *
 * <p>{@link JpaImportedPipelines} is the runtime bean; {@link InProcessImportedPipelines} backs
 * tests.
 */
public interface ImportedPipelines {

    /** Whether this config has already been imported (and so must never be converted again). */
    boolean isImported(String key);

    /**
     * Record the config as imported. Safe to call concurrently: a race on first boot leaves the
     * marker recorded exactly once and never propagates a failure to the caller.
     */
    void markImported(String key);
}
