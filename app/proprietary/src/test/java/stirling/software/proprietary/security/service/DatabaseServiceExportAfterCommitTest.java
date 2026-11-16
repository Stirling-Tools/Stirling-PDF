package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.DatabaseNotificationServiceInterface;

class DatabaseServiceExportAfterCommitTest {

    @TempDir Path backupDir;

    private HikariDataSource dataSource;
    private DatabaseNotificationServiceInterface notifications;
    private DatabaseService databaseService;

    @BeforeEach
    void setUp() {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1");
        config.setUsername("sa");
        config.setMaximumPoolSize(1);
        config.setConnectionTimeout(1_000);
        dataSource = new HikariDataSource(config);

        notifications = mock(DatabaseNotificationServiceInterface.class);
        databaseService =
                new DatabaseService(
                        new ApplicationProperties.Datasource(),
                        dataSource,
                        notifications,
                        mock(ApplicationEventPublisher.class));
        ReflectionTestUtils.setField(databaseService, "BACKUP_DIR", backupDir);
    }

    @AfterEach
    void tearDown() {
        dataSource.close();
    }

    @Test
    void exportAfterCommitReusesTheTransactionConnectionInsteadOfWaitingForAnother()
            throws Exception {
        TransactionTemplate tx =
                new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        AtomicLong exportMillis = new AtomicLong();

        tx.executeWithoutResult(
                status ->
                        TransactionSynchronizationManager.registerSynchronization(
                                new TransactionSynchronization() {
                                    @Override
                                    public void afterCommit() {
                                        long start = System.nanoTime();
                                        databaseService.exportDatabase();
                                        exportMillis.set((System.nanoTime() - start) / 1_000_000);
                                    }
                                }));

        assertThat(exportMillis.get()).isLessThan(1_000);
        try (var backups = Files.list(backupDir)) {
            assertThat(backups.map(p -> p.getFileName().toString()))
                    .anyMatch(n -> n.startsWith(DatabaseService.BACKUP_PREFIX));
        }
        verify(notifications, never()).notifyBackupsFailure(anyString(), anyString());
    }
}
