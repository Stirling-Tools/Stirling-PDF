package stirling.software.proprietary.security.database;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.lang.reflect.Method;
import java.sql.SQLException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import io.quarkus.scheduler.Scheduled;

import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.security.service.DatabaseServiceInterface;

/**
 * MIGRATION (Spring -> Quarkus): the backup task moved from Spring's {@code
 * org.springframework.scheduling.annotation.Scheduled} (SpEL cron) +
 * {@code @Conditional(H2SQLCondition.class)} class-level gate to Quarkus' {@code
 * io.quarkus.scheduler.Scheduled} (config-expression cron). Quarkus has no runtime
 * {@code @Conditional}, so the H2 gate is now evaluated inside {@code performBackup()} via {@code
 * h2SQLCondition.matches()} and the backup is skipped (no-op) when it returns false.
 */
@ExtendWith(MockitoExtension.class)
class ScheduledTasksTest {

    @Mock private DatabaseServiceInterface databaseService;
    @Mock private H2SQLCondition h2SQLCondition;

    private ScheduledTasks tasks;

    @BeforeEach
    void setUp() {
        // @RequiredArgsConstructor only takes the databaseService; h2SQLCondition is a field-
        // injected collaborator. The field is package-private and this test shares the package.
        tasks = new ScheduledTasks(databaseService);
        tasks.h2SQLCondition = h2SQLCondition;
    }

    @Test
    void performBackup_calls_exportDatabase_whenOnH2() throws Exception {
        when(h2SQLCondition.matches()).thenReturn(true);

        tasks.performBackup();

        verify(databaseService, times(1)).exportDatabase();
        verifyNoMoreInteractions(databaseService);
    }

    @Test
    void performBackup_isNoOp_whenNotOnH2() throws Exception {
        when(h2SQLCondition.matches()).thenReturn(false);

        tasks.performBackup();

        // Off H2 the scheduled fire short-circuits before touching the database.
        verifyNoInteractions(databaseService);
    }

    @Test
    void performBackup_propagates_SQLException() throws Exception {
        when(h2SQLCondition.matches()).thenReturn(true);
        doThrow(new SQLException("boom")).when(databaseService).exportDatabase();

        assertThrows(SQLException.class, tasks::performBackup);
    }

    @Test
    void performBackup_propagates_UnsupportedProviderException() throws Exception {
        when(h2SQLCondition.matches()).thenReturn(true);
        doThrow(new UnsupportedProviderException("nope")).when(databaseService).exportDatabase();

        assertThrows(UnsupportedProviderException.class, tasks::performBackup);
    }

    @Test
    void hasQuarkusScheduledAnnotation_withConfigExpressionCron() throws Exception {
        Method m = ScheduledTasks.class.getDeclaredMethod("performBackup");
        Scheduled scheduled = m.getAnnotation(Scheduled.class);
        assertNotNull(scheduled, "@Scheduled annotation missing on performBackup()");
        assertEquals(
                "{system.databaseBackup.cron:off}",
                scheduled.cron(),
                "Unexpected cron config expression");
    }
}
