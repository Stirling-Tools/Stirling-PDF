package stirling.software.proprietary.policy.legacy;

/**
 * Tombstones for legacy configs already converted, so a deleted policy stays deleted even though
 * its JSON is still on disk. Separate from {@code CompletedMigrations}, which operators may clear.
 */
public interface ImportedPipelines {

    boolean isImported(String key);

    void markImported(String key);
}
