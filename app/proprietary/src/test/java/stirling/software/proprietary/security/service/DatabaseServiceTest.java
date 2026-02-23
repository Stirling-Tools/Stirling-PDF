package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;

import javax.sql.DataSource;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.FileInfo;
import stirling.software.proprietary.security.database.DatabaseNotificationServiceInterface;

class DatabaseServiceTest {

    @TempDir Path tempDir;

    @Mock private DatabaseNotificationServiceInterface notificationService;

    private DatabaseService databaseService;
    private ApplicationProperties.Datasource datasourceProps;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        datasourceProps = new ApplicationProperties.Datasource();
        datasourceProps.setType(ApplicationProperties.Driver.H2.name());
        datasourceProps.setCustomDatabaseUrl("jdbc:h2:mem:test");
        datasourceProps.setEnableCustomDatabase(false);

        DataSource dataSource =
                new DriverManagerDataSource(
                        "jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", "");

        databaseService = new DatabaseService(datasourceProps, dataSource, notificationService);
        ReflectionTestUtils.setField(databaseService, "BACKUP_DIR", tempDir);
    }

    @Test
    void hasBackupReturnsFalseWhenEmpty() {
        assertThat(databaseService.hasBackup()).isFalse();
        assertThat(Files.exists(tempDir)).isTrue();
    }

    @Test
    void getBackupListReturnsEntries() throws IOException {
        Path backup =
                tempDir.resolve(
                        "backup_"
                                + LocalDateTime.now()
                                        .format(DateTimeFormatter.ofPattern("yyyyMMddHHmm"))
                                + ".sql");
        Files.writeString(backup, "CREATE TABLE TEST(ID INT);");

        List<stirling.software.common.model.FileInfo> backups = databaseService.getBackupList();

        assertThat(backups).hasSize(1);
        assertThat(backups.get(0).getFileName()).isEqualTo(backup.getFileName().toString());
    }

    @Test
    void importDatabaseFromUICopiesBackupAndDeletesTemp() throws IOException {
        Path script = Files.createTempFile("script", ".sql");
        Files.writeString(script, "CREATE TABLE SAMPLE(ID INT PRIMARY KEY);\n");

        boolean result = databaseService.importDatabaseFromUI(script);

        assertThat(result).isTrue();
        assertThat(Files.exists(script)).isFalse();
        try (var stream = Files.list(tempDir)) {
            assertThat(stream.toList()).isNotEmpty();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void getBackupFilePathPreventsTraversal() {
        assertThatThrownBy(() -> databaseService.getBackupFilePath("../evil.sql"))
                .isInstanceOf(SecurityException.class);
    }

    @Test
    void deleteBackupFileRejectsInvalidName() throws Exception {
        boolean deleted = databaseService.deleteBackupFile("..bad.sql");
        assertThat(deleted).isFalse();
    }

    @Test
    void deleteAllBackupsRemovesFiles() throws Exception {
        Path first = tempDir.resolve("backup_first.sql");
        Path second = tempDir.resolve("backup_second.sql");
        Files.writeString(first, "SELECT 1;");
        Files.writeString(second, "SELECT 1;");

        List<org.apache.commons.lang3.tuple.Pair<FileInfo, Boolean>> results =
                databaseService.deleteAllBackups();

        assertThat(results).hasSize(2);
        assertThat(results.stream().allMatch(org.apache.commons.lang3.tuple.Pair::getRight))
                .isTrue();
        assertThat(Files.exists(first)).isFalse();
        assertThat(Files.exists(second)).isFalse();
    }

    @Test
    void exportDatabaseCreatesScript() {
        databaseService.exportDatabase();

        assertThat(tempDir.toFile().list()).isNotEmpty();
        verify(notificationService)
                .notifyBackupsSuccess(
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString());
    }
}
