package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

import javax.sql.DataSource;

import org.apache.commons.lang3.tuple.Pair;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.FileInfo;
import stirling.software.proprietary.security.database.DatabaseNotificationServiceInterface;
import stirling.software.proprietary.security.model.exception.BackupNotFoundException;

@DisplayName("DatabaseService - additional coverage")
class DatabaseServiceMoreTest {

    @TempDir Path tempDir;

    @Mock private DatabaseNotificationServiceInterface notificationService;

    private DatabaseService databaseService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        ApplicationProperties.Datasource datasourceProps = new ApplicationProperties.Datasource();
        datasourceProps.setType(ApplicationProperties.Driver.H2.name());

        DataSource dataSource =
                new DriverManagerDataSource(
                        "jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", "");

        databaseService = new DatabaseService(datasourceProps, dataSource, notificationService);
        ReflectionTestUtils.setField(databaseService, "BACKUP_DIR", tempDir);
    }

    private Path writeBackup(String fileName) throws IOException {
        Path backup = tempDir.resolve(fileName);
        Files.writeString(backup, "CREATE TABLE T(ID INT);");
        return backup;
    }

    @Nested
    @DisplayName("H2 metadata")
    class H2Metadata {

        @Test
        @DisplayName("getH2Version reports a non-unknown version for a real H2 datasource")
        void getH2Version() {
            assertThat(databaseService.getH2Version()).isNotEqualTo("Unknown");
        }
    }

    @Nested
    @DisplayName("backup presence")
    class BackupPresence {

        @Test
        @DisplayName("hasBackup is true once a backup file is present")
        void hasBackupTrue() throws IOException {
            writeBackup("backup_202601010101.sql");
            assertThat(databaseService.hasBackup()).isTrue();
        }
    }

    @Nested
    @DisplayName("import")
    class Import {

        @Test
        @DisplayName("importDatabase throws when no backups exist")
        void importThrowsWhenEmpty() {
            assertThatThrownBy(() -> databaseService.importDatabase())
                    .isInstanceOf(BackupNotFoundException.class);
        }

        @Test
        @DisplayName("importDatabaseFromUI by name notifies success")
        void importByNameSuccess() throws IOException {
            Path backup = writeBackup("backup_user_202601010101.sql");

            boolean result = databaseService.importDatabaseFromUI(backup.getFileName().toString());

            assertThat(result).isTrue();
            verify(notificationService)
                    .notifyImportsSuccess(
                            org.mockito.ArgumentMatchers.anyString(),
                            org.mockito.ArgumentMatchers.anyString());
        }

        @Test
        @DisplayName("importDatabaseFromUI by name fails validation for a missing file")
        void importByNameMissingFile() {
            // SQL validation reads the file first; a missing file surfaces as a validation failure.
            assertThatThrownBy(
                            () -> databaseService.importDatabaseFromUI("backup_does_not_exist.sql"))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    @DisplayName("deletion")
    class Deletion {

        @Test
        @DisplayName("deleteLastBackup removes the final backup in the list")
        void deleteLastBackup() throws IOException {
            Path first = writeBackup("backup_202601010101.sql");
            Path second = writeBackup("backup_202601020202.sql");

            List<Pair<FileInfo, Boolean>> deleted = databaseService.deleteLastBackup();

            assertThat(deleted).hasSize(1);
            assertThat(deleted.get(0).getRight()).isTrue();
            // Exactly one of the two backups should now be gone.
            assertThat(Files.exists(first) && Files.exists(second)).isFalse();
        }

        @Test
        @DisplayName("deleteLastBackup is a no-op with no backups")
        void deleteLastBackupEmpty() {
            assertThat(databaseService.deleteLastBackup()).isEmpty();
        }

        @Test
        @DisplayName("deleteBackupFile removes a valid file name")
        void deleteBackupFileValid() throws IOException {
            writeBackup("backup_202601010101.sql");

            boolean deleted = databaseService.deleteBackupFile("backup_202601010101.sql");

            assertThat(deleted).isTrue();
            assertThat(Files.exists(tempDir.resolve("backup_202601010101.sql"))).isFalse();
        }

        @Test
        @DisplayName("deleteBackupFile returns false for a non-existent file")
        void deleteBackupFileMissing() throws IOException {
            assertThat(databaseService.deleteBackupFile("backup_missing.sql")).isFalse();
        }
    }

    @Nested
    @DisplayName("path resolution")
    class PathResolution {

        @Test
        @DisplayName("getBackupFilePath resolves a safe name under the backup dir")
        void resolvesSafeName() {
            Path resolved = databaseService.getBackupFilePath("backup_ok.sql");
            assertThat(resolved.startsWith(tempDir)).isTrue();
        }
    }

    @Nested
    @DisplayName("SQL import validation")
    class SqlValidation {

        private Path writeScript(String sql) throws IOException {
            Path script = Files.createTempFile("import", ".sql");
            Files.writeString(script, sql);
            return script;
        }

        @Test
        @DisplayName("rejects FILE_WRITE")
        void rejectsFileWrite() throws IOException {
            Path script = writeScript("CREATE TABLE X AS SELECT FILE_WRITE('data', '/tmp/out');");
            assertThatThrownBy(() -> databaseService.importDatabaseFromUI(script))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("rejects FILE_READ in an INSERT")
        void rejectsFileRead() throws IOException {
            Path script = writeScript("INSERT INTO PUBLIC.X(D) VALUES (FILE_READ('/tmp/in'));");
            assertThatThrownBy(() -> databaseService.importDatabaseFromUI(script))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("rejects CREATE ALIAS")
        void rejectsCreateAlias() throws IOException {
            Path script =
                    writeScript(
                            "CREATE ALIAS MYALIAS AS 'String run(String c) throws Exception"
                                    + " { return c; }';");
            assertThatThrownBy(() -> databaseService.importDatabaseFromUI(script))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("rejects RUNSCRIPT FROM")
        void rejectsRunscript() throws IOException {
            Path script = writeScript("RUNSCRIPT FROM '/tmp/other.sql';");
            assertThatThrownBy(() -> databaseService.importDatabaseFromUI(script))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("allows a backup whose data mentions a keyword")
        void allowsKeywordInsideStringData() throws IOException {
            Path script =
                    writeScript(
                            "CREATE TABLE PUBLIC.NOTES(ID INT, BODY CHARACTER VARYING);"
                                    + " INSERT INTO PUBLIC.NOTES(ID, BODY)"
                                    + " VALUES(1, 'plain text with FILE_WRITE() inside');");
            assertThat(databaseService.importDatabaseFromUI(script)).isTrue();
        }
    }
}
