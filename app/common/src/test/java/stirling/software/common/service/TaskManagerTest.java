package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.cluster.ClusterBackplane;
import stirling.software.common.cluster.JobStore;
import stirling.software.common.cluster.JobStoreEntry;
import stirling.software.common.cluster.JobStoreEntry.JobState;
import stirling.software.common.model.job.JobResult;
import stirling.software.common.model.job.JobStats;
import stirling.software.common.model.job.ResultFile;

class TaskManagerTest {

    @Mock private FileStorage fileStorage;
    @Mock private JobStore jobStore;
    @Mock private ClusterBackplane clusterBackplane;

    @InjectMocks private TaskManager taskManager;

    private AutoCloseable closeable;

    @BeforeEach
    void setUp() {
        closeable = MockitoAnnotations.openMocks(this);
        // Treat the backplane as in-process so cleanupOldJobs is not short-circuited.
        lenient().when(clusterBackplane.backplaneType()).thenReturn("inprocess");
        lenient().when(clusterBackplane.localNodeId()).thenReturn("test-node");
        lenient().when(clusterBackplane.shouldRunLocalCleanup()).thenReturn(true);
        ReflectionTestUtils.setField(taskManager, "jobResultExpiryMinutes", 30);
    }

    @AfterEach
    void tearDown() throws Exception {
        closeable.close();
    }

    @Test
    void testCreateTask() {
        // Act
        String jobId = "test-job-1";
        taskManager.createTask(jobId);

        // Assert
        JobResult result = taskManager.getJobResult(jobId);
        assertNotNull(result);
        assertEquals(jobId, result.getJobId());
        assertFalse(result.isComplete());
        assertNotNull(result.getCreatedAt());
    }

    @Test
    void testSetResult() {
        // Arrange
        String jobId = "test-job-2";
        taskManager.createTask(jobId);
        Object resultObject = "Test result";

        // Act
        taskManager.setResult(jobId, resultObject);

        // Assert
        JobResult result = taskManager.getJobResult(jobId);
        assertNotNull(result);
        assertTrue(result.isComplete());
        assertEquals(resultObject, result.getResult());
        assertNotNull(result.getCompletedAt());
    }

    @Test
    void testSetFileResult() throws Exception {
        // Arrange
        String jobId = "test-job-3";
        taskManager.createTask(jobId);
        String fileId = "file-id";
        String originalFileName = "test.pdf";
        String contentType = MediaType.APPLICATION_PDF_VALUE;
        long fileSize = 1024L;

        // Mock the fileStorage.getFileSize() call
        when(fileStorage.getFileSize(fileId)).thenReturn(fileSize);

        // Act
        taskManager.setFileResult(jobId, fileId, originalFileName, contentType);

        // Assert
        JobResult result = taskManager.getJobResult(jobId);
        assertNotNull(result);
        assertTrue(result.isComplete());
        assertTrue(result.hasFiles());
        assertFalse(result.hasMultipleFiles());

        var resultFiles = result.getAllResultFiles();
        assertEquals(1, resultFiles.size());

        ResultFile resultFile = resultFiles.get(0);
        assertEquals(fileId, resultFile.getFileId());
        assertEquals(originalFileName, resultFile.getFileName());
        assertEquals(contentType, resultFile.getContentType());
        assertEquals(fileSize, resultFile.getFileSize());
        assertNotNull(result.getCompletedAt());
    }

    @Test
    void testSetError() {
        // Arrange
        String jobId = "test-job-4";
        taskManager.createTask(jobId);
        String errorMessage = "Test error";

        // Act
        taskManager.setError(jobId, errorMessage);

        // Assert
        JobResult result = taskManager.getJobResult(jobId);
        assertNotNull(result);
        assertTrue(result.isComplete());
        assertEquals(errorMessage, result.getError());
        assertNotNull(result.getCompletedAt());
    }

    @Test
    void testSetComplete_WithExistingResult() {
        // Arrange
        String jobId = "test-job-5";
        taskManager.createTask(jobId);
        Object resultObject = "Test result";
        taskManager.setResult(jobId, resultObject);

        // Act
        taskManager.setComplete(jobId);

        // Assert
        JobResult result = taskManager.getJobResult(jobId);
        assertNotNull(result);
        assertTrue(result.isComplete());
        assertEquals(resultObject, result.getResult());
    }

    @Test
    void testSetComplete_WithoutExistingResult() {
        // Arrange
        String jobId = "test-job-6";
        taskManager.createTask(jobId);

        // Act
        taskManager.setComplete(jobId);

        // Assert
        JobResult result = taskManager.getJobResult(jobId);
        assertNotNull(result);
        assertTrue(result.isComplete());
        assertEquals("Task completed successfully", result.getResult());
    }

    @Test
    void testIsComplete() {
        // Arrange
        String jobId = "test-job-7";
        taskManager.createTask(jobId);

        // Assert - not complete initially
        assertFalse(taskManager.isComplete(jobId));

        // Act - mark as complete
        taskManager.setComplete(jobId);

        // Assert - now complete
        assertTrue(taskManager.isComplete(jobId));
    }

    @Test
    void testGetJobStats() throws Exception {
        // Arrange
        // Mock fileStorage.getFileSize for file operations
        when(fileStorage.getFileSize("file-id")).thenReturn(1024L);

        // 1. Create active job
        String activeJobId = "active-job";
        taskManager.createTask(activeJobId);

        // 2. Create completed successful job with file
        String successFileJobId = "success-file-job";
        taskManager.createTask(successFileJobId);
        taskManager.setFileResult(
                successFileJobId, "file-id", "test.pdf", MediaType.APPLICATION_PDF_VALUE);

        // 3. Create completed successful job without file
        String successJobId = "success-job";
        taskManager.createTask(successJobId);
        taskManager.setResult(successJobId, "Result");

        // 4. Create failed job
        String failedJobId = "failed-job";
        taskManager.createTask(failedJobId);
        taskManager.setError(failedJobId, "Error message");

        // Act
        JobStats stats = taskManager.getJobStats();

        // Assert
        assertEquals(4, stats.getTotalJobs());
        assertEquals(1, stats.getActiveJobs());
        assertEquals(3, stats.getCompletedJobs());
        assertEquals(1, stats.getFailedJobs());
        assertEquals(2, stats.getSuccessfulJobs());
        assertEquals(1, stats.getFileResultJobs());
        assertNotNull(stats.getNewestActiveJobTime());
        assertNotNull(stats.getOldestActiveJobTime());
        assertTrue(stats.getAverageProcessingTimeMs() >= 0);
    }

    @Test
    void testCleanupOldJobs() {
        // Capture test time at the beginning for deterministic calculations
        final LocalDateTime testTime = LocalDateTime.now();
        // Arrange
        // 1. Create a recent completed job
        String recentJobId = "recent-job";
        taskManager.createTask(recentJobId);
        taskManager.setResult(recentJobId, "Result");

        // 2. Create an old completed job with file result
        String oldJobId = "old-job";
        taskManager.createTask(oldJobId);
        JobResult oldJob = taskManager.getJobResult(oldJobId);

        // Manually set the completion time to be older than the expiry (relative to test start
        // time)
        LocalDateTime oldTime = testTime.minusHours(1);
        ReflectionTestUtils.setField(oldJob, "completedAt", oldTime);
        ReflectionTestUtils.setField(oldJob, "complete", true);

        // Create a ResultFile and set it using the new approach
        ResultFile resultFile =
                ResultFile.builder()
                        .fileId("file-id")
                        .fileName("test.pdf")
                        .contentType(MediaType.APPLICATION_PDF_VALUE)
                        .fileSize(1024L)
                        .build();
        ReflectionTestUtils.setField(oldJob, "resultFiles", java.util.List.of(resultFile));

        when(fileStorage.deleteFile("file-id")).thenReturn(true);

        // Obtain access to the private jobResults map
        Map<String, JobResult> jobResultsMap =
                (Map<String, JobResult>) ReflectionTestUtils.getField(taskManager, "jobResults");

        // 3. Create an active job
        String activeJobId = "active-job";
        taskManager.createTask(activeJobId);

        // Verify all jobs are in the map
        assertNotNull(jobResultsMap);
        assertTrue(jobResultsMap.containsKey(recentJobId));
        assertTrue(jobResultsMap.containsKey(oldJobId));
        assertTrue(jobResultsMap.containsKey(activeJobId));

        // Act
        taskManager.cleanupOldJobs();

        // Assert - the old job should be removed
        assertFalse(jobResultsMap.containsKey(oldJobId));
        assertTrue(jobResultsMap.containsKey(recentJobId));
        assertTrue(jobResultsMap.containsKey(activeJobId));
        verify(fileStorage).deleteFile("file-id");
    }

    @Test
    void testCleanupOldJobs_NoOpWhenBackplaneOwnsExpiry() {
        // When the backplane reports it should NOT run local cleanup (e.g. a distributed
        // backplane with its own TTL), the cleanup loop must leave local state untouched.
        when(clusterBackplane.shouldRunLocalCleanup()).thenReturn(false);

        // Seed an old completed job that would normally be removed.
        String oldJobId = "old-job-distributed";
        taskManager.createTask(oldJobId);
        JobResult oldJob = taskManager.getJobResult(oldJobId);
        ReflectionTestUtils.setField(oldJob, "completedAt", LocalDateTime.now().minusHours(1));
        ReflectionTestUtils.setField(oldJob, "complete", true);

        Map<String, JobResult> jobResultsMap =
                (Map<String, JobResult>) ReflectionTestUtils.getField(taskManager, "jobResults");
        assertNotNull(jobResultsMap);
        assertTrue(jobResultsMap.containsKey(oldJobId));

        // Act
        taskManager.cleanupOldJobs();

        // Assert: nothing was removed locally, and no jobStore.delete was issued.
        assertTrue(jobResultsMap.containsKey(oldJobId));
        verify(jobStore, never()).delete(anyString());
        verify(fileStorage, never()).deleteFile(anyString());
    }

    @Test
    void testShutdown() {
        // This mainly tests that the shutdown method doesn't throw exceptions
        taskManager.shutdown();

        // Verify the executor service is shutdown
        // This is difficult to test directly, but we can verify it doesn't throw exceptions
    }

    @Test
    void testAddNote() {
        // Arrange
        String jobId = "test-job-8";
        taskManager.createTask(jobId);
        String note = "Test note";

        // Act
        boolean result = taskManager.addNote(jobId, note);

        // Assert
        assertTrue(result);
        JobResult jobResult = taskManager.getJobResult(jobId);
        assertNotNull(jobResult);
        assertNotNull(jobResult.getNotes());
        assertEquals(1, jobResult.getNotes().size());
        assertEquals(note, jobResult.getNotes().get(0));
    }

    @Test
    void testAddNote_NonExistentJob() {
        // Arrange
        String jobId = "non-existent-job";
        String note = "Test note";

        // Act
        boolean result = taskManager.addNote(jobId, note);

        // Assert
        assertFalse(result);
    }

    @Test
    void testWriteThroughOnUpdate() {
        // Mutating calls must write through to the injected JobStore.
        String jobId = "write-through-job";
        taskManager.createTask(jobId);
        taskManager.setResult(jobId, "done");

        ArgumentCaptor<JobStoreEntry> captor = ArgumentCaptor.forClass(JobStoreEntry.class);
        verify(jobStore, atLeast(2)).put(captor.capture(), any());

        JobStoreEntry last = captor.getValue();
        assertEquals(jobId, last.jobId());
        assertEquals(JobState.COMPLETE, last.state());
        assertEquals("test-node", last.owningNodeId());
    }

    @Test
    void testFindJobKeyByFileId_FallsBackToJobStore() {
        // When the file id is not in the local map, TaskManager delegates to JobStore.
        String fileId = "remote-file-id";
        String expectedJobKey = "remote-job-key";
        when(jobStore.findJobIdByFileId(fileId)).thenReturn(Optional.of(expectedJobKey));

        String actual = taskManager.findJobKeyByFileId(fileId);

        assertEquals(expectedJobKey, actual);
        verify(jobStore).findJobIdByFileId(fileId);
    }
}
