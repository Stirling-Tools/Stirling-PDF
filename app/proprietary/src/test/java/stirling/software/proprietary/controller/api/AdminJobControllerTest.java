package stirling.software.proprietary.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import stirling.software.common.service.JobQueue;
import stirling.software.common.service.TaskManager;

/**
 * The admin sweep covers every user's jobs, so it must stay distinct from the self-service endpoint
 * on JobController - and both must run the same TaskManager sweep rather than each growing their
 * own cleanup logic.
 */
class AdminJobControllerTest {

    @Mock private TaskManager taskManager;
    @Mock private JobQueue jobQueue;

    @InjectMocks private AdminJobController controller;

    private AutoCloseable closeable;

    @BeforeEach
    void setUp() {
        closeable = MockitoAnnotations.openMocks(this);
    }

    @Test
    void cleanupWithoutForceRunsTheRetentionSweep() throws Exception {
        when(taskManager.cleanupOldJobs()).thenReturn(new TaskManager.CleanupSummary(2, 4, 3));

        ResponseEntity<?> response = controller.cleanupOldJobs(false);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertEquals(2, body.get("removedJobs"));
        assertEquals(4, body.get("filesDeleted"));
        assertEquals(3, body.get("remainingJobs"));
        verify(taskManager).cleanupOldJobs();
        verify(taskManager, never()).cleanupFinishedJobsNow(any());
        closeable.close();
    }

    @Test
    void cleanupWithForceIgnoresTheRetentionWindow() throws Exception {
        when(taskManager.cleanupFinishedJobsNow(any()))
                .thenReturn(new TaskManager.CleanupSummary(5, 9, 0));

        ResponseEntity<?> response = controller.cleanupOldJobs(true);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertEquals(5, body.get("removedJobs"));
        assertEquals(9, body.get("filesDeleted"));
        verify(taskManager).cleanupFinishedJobsNow(any());
        verify(taskManager, never()).cleanupOldJobs();
        closeable.close();
    }

    @Test
    void forcedAdminCleanupSweepsEveryUsersJobs() throws Exception {
        when(taskManager.cleanupFinishedJobsNow(any()))
                .thenReturn(new TaskManager.CleanupSummary(1, 1, 0));

        controller.cleanupOldJobs(true);

        @SuppressWarnings("unchecked")
        org.mockito.ArgumentCaptor<java.util.function.Predicate<String>> filter =
                org.mockito.ArgumentCaptor.forClass(java.util.function.Predicate.class);
        verify(taskManager).cleanupFinishedJobsNow(filter.capture());
        // Unlike the self-service endpoint, the admin sweep is not scoped to one caller.
        assertTrue(filter.getValue().test("alice:job"));
        assertTrue(filter.getValue().test("bob:job"));
        closeable.close();
    }
}
