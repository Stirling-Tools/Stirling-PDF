package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import stirling.software.common.context.JobContextHolder;

class JobProgressServiceTest {

    @Mock private TaskManager taskManager;

    private JobProgressService jobProgressService;

    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        jobProgressService = new JobProgressService(taskManager);
        JobContextHolder.clear();
    }

    @AfterEach
    void tearDown() throws Exception {
        JobContextHolder.clear();
        mocks.close();
    }

    @Test
    void updateProgressReturnsFalseWhenNoContext() {
        boolean updated = jobProgressService.updateProgress(10, "Stage");
        assertFalse(updated);
        verify(taskManager, never()).updateProgress(anyString(), anyInt(), anyString());
    }

    @Test
    void updateProgressDelegatesToTaskManager() {
        JobContextHolder.setContext("job-123", true);
        when(taskManager.updateProgress("job-123", 20, "Processing")).thenReturn(true);

        boolean updated = jobProgressService.updateProgress(20, "Processing");

        assertTrue(updated);
        verify(taskManager).updateProgress("job-123", 20, "Processing");
    }

    @Test
    void trackerNoOpsWhenDisabled() {
        JobContextHolder.setContext("job-123", false);
        JobProgressTracker tracker = jobProgressService.tracker(5, "Start");

        assertFalse(tracker.isEnabled());
        tracker.advanceBy(1, "Step");
        tracker.complete("Done");

        verify(taskManager, never()).updateProgress(anyString(), anyInt(), anyString());
    }

    @Test
    void trackerPublishesProgress() {
        JobContextHolder.setContext("job-123", true);
        JobProgressTracker tracker = jobProgressService.tracker(4, "Starting");

        assertTrue(tracker.isEnabled());
        verify(taskManager).updateProgress("job-123", 0, "Starting");

        tracker.advanceBy(1, "25 percent");
        tracker.advanceBy(1, "50 percent");
        tracker.setStepsCompleted(3, "75 percent");
        tracker.complete("Done");

        verify(taskManager).updateProgress("job-123", 25, "25 percent");
        verify(taskManager).updateProgress("job-123", 50, "50 percent");
        verify(taskManager).updateProgress("job-123", 75, "75 percent");
        verify(taskManager).updateProgress("job-123", 100, "Done");
    }
}
