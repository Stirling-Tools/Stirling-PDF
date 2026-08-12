package stirling.software.proprietary.security.migration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class H2DatabaseMigrationTest {

    private static final String OLD_H2_RESOURCE = "h2-migration/h2-2.3.232.jar";

    @Test
    void migratesLegacyDatabaseAndKeepsSourceAsFallback(@TempDir Path tempDirectory)
            throws Exception {
        Path fixture =
                Path.of("src/test/resources/db-migration-fixtures/stirling-pdf-v2.10.0.mv.db");
        Path oldDatabase = tempDirectory.resolve(H2DatabaseMigration.OLD_DATABASE_NAME + ".mv.db");
        Path backupDirectory = tempDirectory.resolve("backup");
        Path backupFile = backupDirectory.resolve("backup_20260730.sql");
        Files.createDirectories(backupDirectory);
        Files.writeString(backupFile, "-- existing backup; migration must not touch this file\n");
        Files.copy(fixture, oldDatabase);

        H2DatabaseMigration.migrateIfNeeded(tempDirectory, bundledOldH2Jar());

        Path newDatabase = tempDirectory.resolve(H2DatabaseMigration.NEW_DATABASE_NAME + ".mv.db");
        assertThat(newDatabase).exists();
        assertThat(oldDatabase).exists();
        assertThat(backupFile)
                .hasContent("-- existing backup; migration must not touch this file\n");

        try (var connection =
                DriverManager.getConnection(
                        "jdbc:h2:file:"
                                + tempDirectory.resolve(H2DatabaseMigration.NEW_DATABASE_NAME)
                                + ";IFEXISTS=TRUE",
                        "sa",
                        "")) {
            try (var statement = connection.prepareStatement("SELECT COUNT(*) FROM USERS")) {
                try (var result = statement.executeQuery()) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getInt(1)).isGreaterThanOrEqualTo(1);
                }
            }
            try (var statement = connection.prepareStatement("SELECT H2VERSION() FROM DUAL")) {
                try (var result = statement.executeQuery()) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getString(1)).startsWith("2.4.");
                }
            }
        }
    }

    @Test
    void doesNotOverwriteAnAlreadyMigratedDatabase(@TempDir Path tempDirectory) throws Exception {
        Path oldDatabase = tempDirectory.resolve(H2DatabaseMigration.OLD_DATABASE_NAME + ".mv.db");
        Path newDatabase = tempDirectory.resolve(H2DatabaseMigration.NEW_DATABASE_NAME + ".mv.db");
        Files.writeString(oldDatabase, "legacy");
        Files.writeString(newDatabase, "current");

        H2DatabaseMigration.migrateIfNeeded(tempDirectory, bundledOldH2Jar());

        assertThat(Files.readString(newDatabase)).isEqualTo("current");
    }

    @Test
    void leavesLegacyDatabaseUntouchedWhenConversionFails(@TempDir Path tempDirectory)
            throws Exception {
        Path oldDatabase = tempDirectory.resolve(H2DatabaseMigration.OLD_DATABASE_NAME + ".mv.db");
        Files.writeString(oldDatabase, "not an H2 database");

        assertThatThrownBy(
                        () ->
                                H2DatabaseMigration.migrateIfNeeded(
                                        tempDirectory, Path.of("missing-h2-2.3.232.jar")))
                .isInstanceOf(java.io.IOException.class);

        assertThat(oldDatabase).exists();
        assertThat(tempDirectory.resolve(H2DatabaseMigration.NEW_DATABASE_NAME + ".mv.db"))
                .doesNotExist();
    }

    private static Path bundledOldH2Jar() throws Exception {
        var resource = H2DatabaseMigrationTest.class.getClassLoader().getResource(OLD_H2_RESOURCE);
        assertThat(resource).isNotNull();
        return Path.of(resource.toURI());
    }
}
