package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import javax.sql.DataSource;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.DatabaseNotificationServiceInterface;

class DatabaseServiceBackupRetentionTest {

    @TempDir Path backupDir;

    private final DataSource dataSource = mock(DataSource.class);
    private final Connection connection = mock(Connection.class);
    private final DatabaseNotificationServiceInterface notifications =
            mock(DatabaseNotificationServiceInterface.class);

    private DatabaseService service;
    private List<Path> existingBackups;

    @BeforeEach
    void setUp() throws Exception {
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("H2");
        service =
                new DatabaseService(
                        new ApplicationProperties.Datasource(),
                        dataSource,
                        notifications,
                        mock(ApplicationEventPublisher.class));
        ReflectionTestUtils.setField(service, "BACKUP_DIR", backupDir);

        existingBackups = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            Path backup = backupDir.resolve("backup_20260101010" + i + ".sql");
            Files.writeString(backup, "CREATE TABLE OLD_BACKUP_" + i + "(ID INT);");
            existingBackups.add(backup);
        }
        // Populate H2 detection before the connection becomes unavailable.
        assertThat(service.getBackupList()).hasSize(6);
    }

    @Test
    void connectionFailureRetainsExistingBackups() throws Exception {
        when(dataSource.getConnection()).thenThrow(new SQLException("Database unavailable"));

        service.exportDatabase();

        assertExistingBackupsUnchanged();
        verify(notifications).notifyBackupsFailure(anyString(), anyString());
        verify(notifications, never()).notifyBackupsSuccess(anyString(), anyString());
    }

    @Test
    void exportFailureRetainsExistingBackups() throws Exception {
        PreparedStatement statement = mock(PreparedStatement.class);
        when(connection.prepareStatement(anyString())).thenReturn(statement);
        AtomicReference<Path> output = new AtomicReference<>();
        doAnswer(
                        invocation -> {
                            output.set(Path.of(invocation.getArgument(1, String.class)));
                            return null;
                        })
                .when(statement)
                .setString(org.mockito.ArgumentMatchers.eq(1), anyString());
        when(statement.execute())
                .thenAnswer(
                        invocation -> {
                            Files.writeString(output.get(), "PARTIAL EXPORT;");
                            throw new SQLException("Export failed");
                        });

        service.exportDatabase();

        assertExistingBackupsUnchanged();
        verify(notifications).notifyBackupsFailure(anyString(), anyString());
        verify(notifications, never()).notifyBackupsSuccess(anyString(), anyString());
    }

    @Test
    void verificationFailureRetainsExistingBackups() throws Exception {
        Path sameMinuteBackup =
                backupDir.resolve(
                        "backup_"
                                + LocalDateTime.now()
                                        .format(DateTimeFormatter.ofPattern("yyyyMMddHHmm"))
                                + ".sql");
        String previousScript = "CREATE TABLE PREVIOUS_VERIFIED_BACKUP(ID INT);";
        Files.writeString(sameMinuteBackup, previousScript);
        PreparedStatement statement = mock(PreparedStatement.class);
        when(connection.prepareStatement(anyString())).thenReturn(statement);
        AtomicReference<Path> output = new AtomicReference<>();
        doAnswer(
                        invocation -> {
                            output.set(Path.of(invocation.getArgument(1, String.class)));
                            return null;
                        })
                .when(statement)
                .setString(org.mockito.ArgumentMatchers.eq(1), anyString());
        when(statement.execute())
                .thenAnswer(
                        invocation -> {
                            Files.writeString(output.get(), "INVALID BACKUP SQL;");
                            return false;
                        });

        service.exportDatabase();

        assertExistingBackupsUnchanged(sameMinuteBackup);
        assertThat(sameMinuteBackup).hasContent(previousScript);
        assertThat(output.get()).doesNotExist();
        verify(notifications).notifyBackupsFailure(anyString(), anyString());
        verify(notifications, never()).notifyBackupsSuccess(anyString(), anyString());
    }

    @Test
    void verifiedExportPrunesOldestAutomaticBackupAndKeepsUserBackup() throws Exception {
        DataSource working =
                new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID(), "sa", "");
        when(dataSource.getConnection()).thenAnswer(invocation -> working.getConnection());
        Path userBackup = backupDir.resolve("backup_user_202501010101.sql");
        Files.writeString(userBackup, "CREATE TABLE USER_BACKUP(ID INT);");

        service.exportDatabase();

        assertThat(existingBackups.getFirst()).doesNotExist();
        for (Path backup : existingBackups.subList(1, existingBackups.size())) {
            assertThat(backup).exists();
        }
        assertThat(userBackup).hasContent("CREATE TABLE USER_BACKUP(ID INT);");
        assertThat(service.getBackupList()).hasSize(7);
        try (var paths = Files.list(backupDir)) {
            assertThat(paths.toList())
                    .allSatisfy(
                            path ->
                                    assertThat(path.getFileName().toString())
                                            .matches("backup_(user_)?\\d{12}\\.sql"));
        }
        service.exportDatabase();
        assertThat(service.getBackupList()).hasSize(7);
        verify(notifications, times(2)).notifyBackupsSuccess(anyString(), anyString());
        verify(notifications, never()).notifyBackupsFailure(anyString(), anyString());
    }

    private void assertExistingBackupsUnchanged(Path... otherBackups) throws IOException {
        for (int i = 0; i < existingBackups.size(); i++) {
            assertThat(existingBackups.get(i))
                    .hasContent("CREATE TABLE OLD_BACKUP_" + i + "(ID INT);");
        }
        List<Path> expected = new ArrayList<>(existingBackups);
        expected.addAll(List.of(otherBackups));
        try (var paths = Files.list(backupDir)) {
            assertThat(paths.toList()).containsExactlyInAnyOrderElementsOf(expected);
        }
    }
}
