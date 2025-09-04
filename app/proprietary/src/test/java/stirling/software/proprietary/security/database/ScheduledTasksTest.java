package stirling.software.proprietary.security.database;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.lang.reflect.Method;
import java.sql.SQLException;
import java.util.Arrays;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.annotation.Conditional;
import org.springframework.scheduling.annotation.Scheduled;

import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.security.service.DatabaseServiceInterface;

@ExtendWith(MockitoExtension.class)
class ScheduledTasksTest {

    @Mock private DatabaseServiceInterface databaseService;

    @Test
    void performBackup_calls_exportDatabase() throws Exception {
        ScheduledTasks tasks = new ScheduledTasks(databaseService);

        tasks.performBackup();

        verify(databaseService, times(1)).exportDatabase();
        verifyNoMoreInteractions(databaseService);
    }

    @Test
    void performBackup_propagates_SQLException() throws Exception {
        ScheduledTasks tasks = new ScheduledTasks(databaseService);
        doThrow(new SQLException("boom")).when(databaseService).exportDatabase();

        assertThrows(SQLException.class, tasks::performBackup);
    }

    @Test
    void performBackup_propagates_UnsupportedProviderException() throws Exception {
        ScheduledTasks tasks = new ScheduledTasks(databaseService);
        doThrow(new UnsupportedProviderException("nope")).when(databaseService).exportDatabase();

        assertThrows(UnsupportedProviderException.class, tasks::performBackup);
    }

    @Test
    void hasScheduledAnnotation_withSpELCron() throws Exception {
        Method m = ScheduledTasks.class.getDeclaredMethod("performBackup");
        Scheduled scheduled = m.getAnnotation(Scheduled.class);
        assertNotNull(scheduled, "@Scheduled annotation missing on performBackup()");
        assertEquals(
                "#{applicationProperties.system.databaseBackup.cron}",
                scheduled.cron(),
                "Unexpected cron SpEL expression");
    }

    @Test
    void classHasConditional_onH2SQLCondition() {
        Conditional conditional = ScheduledTasks.class.getAnnotation(Conditional.class);
        assertNotNull(conditional, "@Conditional missing on ScheduledTasks class");

        boolean containsH2 =
                Arrays.stream(conditional.value()).anyMatch(c -> c == H2SQLCondition.class);
        assertTrue(containsH2, "@Conditional should include H2SQLCondition");
    }
}
