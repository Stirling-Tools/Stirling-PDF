package stirling.software.proprietary.security.database.migration;

public interface MigrationStep {

    /**
     * Get the schema version this migration step is migrating from.
     *
     * @return
     */
    String fromSchemaVersion();

    /**
     * Get the schema version this migration step is migrating to.
     *
     * @return
     */
    String toSchemaVersion();

    /**
     * Run the migration step.
     *
     * @throws Exception if the migration fails.
     */
    void run() throws Exception;
}
