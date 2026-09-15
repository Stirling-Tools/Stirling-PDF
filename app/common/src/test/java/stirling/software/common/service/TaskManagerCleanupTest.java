package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.cluster.ClusterBackplane;
import stirling.software.common.cluster.JobStore;
import stirling.software.common.model.job.JobResult;
import stirling.software.common.model.job.ResultFile;

/**
 * Covers the on-demand cleanup path and the input-copy tracking that makes it complete. An async
 * submit persists a copy of the upload as well as its results; before both were tracked, only the
 * results were ever deleted and the input copy stayed on disk indefinitely.
 */
class TaskManagerCleanupTest {

    @Mock private FileStorage fileStorage;
    @Mock private JobStore jobStore;
    @Mock private ClusterBackplane clusterBackplane;

    @InjectMocks private TaskManager taskManager;

    private AutoCloseable closeable;

    @BeforeEach
    void setUp() {
        closeable = MockitoAnnotations.openMocks(this);
        lenient().when(clusterBackplane.localNodeId()).thenReturn("test-node");
        lenient().when(clusterBackplane.shouldRunLocalCleanup()).thenReturn(true);
        lenient().when(fileStorage.deleteFileAsSystem(anyString())).thenReturn(true);
        ReflectionTestUtils.setField(taskManager, "jobResultExpiryMinutes", 30);
        ReflectionTestUtils.setField(taskManager, "pendingJobExpiryMinutes", 1440);
    }

    @AfterEach
    void tearDown() throws Exception {
        closeable.close();
    }

    @SuppressWarnings("unchecked")
    private Map<String, JobResult> jobResults() {
        return (Map<String, JobResult>) ReflectionTestUtils.getField(taskManager, "jobResults");
    }

    /** Complete a job with a single result file, as an async file-producing job would. */
    private void completeWithFile(String jobId, String fileId) {
        taskManager.setFileResult(jobId, fileId, "out.pdf", MediaType.APPLICATION_PDF_VALUE);
        taskManager.setComplete(jobId);
    }

    @Test
    void forcedCleanupRemovesFinishedJobsRegardlessOfAge() {
        String jobId = "fresh-job";
        taskManager.createTask(jobId);
        completeWithFile(jobId, "result-file");

        // The scheduled sweep leaves it alone: it completed well inside the retention window.
        taskManager.cleanupOldJobs();
        assertTrue(jobResults().containsKey(jobId), "Scheduled cleanup should respect the expiry");

        TaskManager.CleanupSummary summary = taskManager.cleanupFinishedJobsNow(id -> true);

        assertEquals(1, summary.jobsRemoved());
        assertEquals(1, summary.filesDeleted());
        assertEquals(0, summary.jobsRetained());
        assertFalse(jobResults().containsKey(jobId));
        verify(fileStorage).deleteFileAsSystem("result-file");
        verify(jobStore).delete(jobId);
    }

    @Test
    void forcedCleanupDeletesThePersistedInputCopy() {
        String jobId = "job-with-input";
        taskManager.createTask(jobId);
        assertTrue(taskManager.registerInputFile(jobId, "input-file"));
        completeWithFile(jobId, "result-file");

        TaskManager.CleanupSummary summary = taskManager.cleanupFinishedJobsNow(id -> true);

        assertEquals(1, summary.jobsRemoved());
        assertEquals(2, summary.filesDeleted(), "Both the result and the input copy must go");
        verify(fileStorage).deleteFileAsSystem("result-file");
        verify(fileStorage).deleteFileAsSystem("input-file");
    }

    @Test
    void scheduledCleanupAlsoDeletesThePersistedInputCopy() {
        String jobId = "expired-job";
        taskManager.createTask(jobId);
        taskManager.registerInputFile(jobId, "input-file");
        completeWithFile(jobId, "result-file");

        JobResult result = taskManager.getJobResult(jobId);
        ReflectionTestUtils.setField(result, "completedAt", LocalDateTime.now().minusHours(1));

        taskManager.cleanupOldJobs();

        assertFalse(jobResults().containsKey(jobId));
        verify(fileStorage).deleteFileAsSystem("result-file");
        verify(fileStorage).deleteFileAsSystem("input-file");
    }

    @Test
    void forcedCleanupLeavesRunningJobsAlone() {
        String running = "running-job";
        taskManager.createTask(running);
        taskManager.registerInputFile(running, "in-flight-input");

        TaskManager.CleanupSummary summary = taskManager.cleanupFinishedJobsNow(id -> true);

        assertEquals(0, summary.jobsRemoved());
        assertEquals(0, summary.filesDeleted());
        assertEquals(1, summary.jobsRetained());
        assertTrue(jobResults().containsKey(running));
        // Deleting a running job's input mid-flight would break it.
        verify(fileStorage, never()).deleteFileAsSystem(anyString());
    }

    @Test
    void forcedCleanupSkipsJobsTheFilterRejects() {
        taskManager.createTask("alice:job");
        completeWithFile("alice:job", "alice-file");
        taskManager.createTask("bob:job");
        completeWithFile("bob:job", "bob-file");

        TaskManager.CleanupSummary summary =
                taskManager.cleanupFinishedJobsNow(id -> id.startsWith("alice:"));

        assertEquals(1, summary.jobsRemoved());
        assertEquals(1, summary.jobsRetained());
        assertFalse(jobResults().containsKey("alice:job"));
        assertTrue(jobResults().containsKey("bob:job"), "Another user's job must survive");
        verify(fileStorage).deleteFileAsSystem("alice-file");
        verify(fileStorage, never()).deleteFileAsSystem("bob-file");
    }

    @Test
    void forcedCleanupIsIdempotent() {
        String jobId = "job-to-clean";
        taskManager.createTask(jobId);
        taskManager.registerInputFile(jobId, "input-file");
        completeWithFile(jobId, "result-file");

        taskManager.cleanupFinishedJobsNow(id -> true);
        TaskManager.CleanupSummary second = taskManager.cleanupFinishedJobsNow(id -> true);

        assertEquals(0, second.jobsRemoved());
        assertEquals(0, second.filesDeleted());
    }

    @Test
    void forcedCleanupRunsEvenWhenTheBackplaneOwnsScheduledExpiry() {
        // The scheduled sweep defers to the backplane TTL in cluster mode, but an explicit
        // request to release this node's storage still has to do something.
        when(clusterBackplane.shouldRunLocalCleanup()).thenReturn(false);
        String jobId = "clustered-job";
        taskManager.createTask(jobId);
        completeWithFile(jobId, "result-file");

        taskManager.cleanupOldJobs();
        assertTrue(jobResults().containsKey(jobId));

        TaskManager.CleanupSummary summary = taskManager.cleanupFinishedJobsNow(id -> true);

        assertEquals(1, summary.jobsRemoved());
        assertFalse(jobResults().containsKey(jobId));
    }

    @Test
    void cleanupCountsOnlyFilesThatWereActuallyDeleted() {
        // A file already gone (a retry deleted it, say) must not be counted as freed.
        String jobId = "partially-cleaned";
        taskManager.createTask(jobId);
        taskManager.registerInputFile(jobId, "already-gone");
        completeWithFile(jobId, "result-file");
        when(fileStorage.deleteFileAsSystem("already-gone")).thenReturn(false);

        TaskManager.CleanupSummary summary = taskManager.cleanupFinishedJobsNow(id -> true);

        assertEquals(1, summary.filesDeleted());
    }

    @Test
    void cleanupSurvivesAFileStorageFailure() {
        String jobId = "job-with-unhappy-storage";
        taskManager.createTask(jobId);
        taskManager.registerInputFile(jobId, "input-file");
        completeWithFile(jobId, "result-file");
        when(fileStorage.deleteFileAsSystem("result-file"))
                .thenThrow(new RuntimeException("disk on fire"));

        TaskManager.CleanupSummary summary = taskManager.cleanupFinishedJobsNow(id -> true);

        // The job is still released and the remaining file still deleted.
        assertEquals(1, summary.jobsRemoved());
        assertEquals(1, summary.filesDeleted());
        assertFalse(jobResults().containsKey(jobId));
        verify(fileStorage).deleteFileAsSystem("input-file");
    }

    @Test
    void registerInputFileRejectsAnUnknownJob() {
        assertFalse(taskManager.registerInputFile("no-such-job", "input-file"));
    }

    @Test
    void registerInputFileIgnoresDuplicatesAndBlanks() {
        String jobId = "dedupe-job";
        taskManager.createTask(jobId);
        taskManager.registerInputFile(jobId, "input-file");
        taskManager.registerInputFile(jobId, "input-file");
        taskManager.registerInputFile(jobId, "  ");
        taskManager.registerInputFile(jobId, null);

        List<String> inputFileIds = taskManager.getJobResult(jobId).getInputFileIds();

        assertEquals(List.of("input-file"), inputFileIds);
    }

    @Test
    void multiFileResultsAndTheInputCopyAreAllDeleted() {
        String jobId = "split-job";
        taskManager.createTask(jobId);
        taskManager.registerInputFile(jobId, "input-file");
        JobResult result = taskManager.getJobResult(jobId);
        result.completeWithFiles(
                List.of(
                        ResultFile.builder()
                                .fileId("page-1")
                                .fileName("1.pdf")
                                .contentType(MediaType.APPLICATION_PDF_VALUE)
                                .fileSize(10L)
                                .build(),
                        ResultFile.builder()
                                .fileId("page-2")
                                .fileName("2.pdf")
                                .contentType(MediaType.APPLICATION_PDF_VALUE)
                                .fileSize(10L)
                                .build()));

        TaskManager.CleanupSummary summary = taskManager.cleanupFinishedJobsNow(id -> true);

        assertEquals(3, summary.filesDeleted());
        verify(fileStorage).deleteFileAsSystem("page-1");
        verify(fileStorage).deleteFileAsSystem("page-2");
        verify(fileStorage).deleteFileAsSystem("input-file");
    }
}
