package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.model.job.JobResult;
import stirling.software.common.model.job.JobStats;
import stirling.software.common.model.job.ResultFile;

class TaskManagerTest {

    @Mock
    private FileStorage fileStorage;

    @InjectMocks
    private TaskManager taskManager;

    private AutoCloseable closeable;

    @BeforeEach
    void setUp() {
        closeable = MockitoAnnotations.openMocks(this);
        ReflectionTestUtils.setField(taskManager, "jobResultExpiryMinutes", 30);
    }

    @AfterEach
    void tearDown() throws Exception {
        closeable.close();
    }

    @Test
    @DisplayName("Test creating a task")
    void testCreateTask() {
        // Act
        String jobId = UUID.randomUUID().toString();
        taskManager.createTask(jobId);

        // Assert
        JobResult result = taskManager.getJobResult(jobId);
        assertNotNull(result);
        assertEquals(jobId, result.getJobId());
        assertFalse(result.isComplete());
        assertNotNull(result.getCreatedAt());
    }

    @Test
    @DisplayName("Test getting a job result")
    void testSetResult() {
        // Arrange
        String jobId = UUID.randomUUID().toString();
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
    @DisplayName("Test setting file result")
    void testSetFileResult() throws Exception {
        // Arrange
        String jobId = UUID.randomUUID().toString();
        taskManager.createTask(jobId);
        String fileId = "file-id";
        String originalFileName = "test.pdf";
        String contentType = "application/pdf";
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
    @DisplayName("Test setting error on job")
    void testSetError() {
        // Arrange
        String jobId = UUID.randomUUID().toString();
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
    @DisplayName("Test setting job as complete with existing result")
    void testSetComplete_WithExistingResult() {
        // Arrange
        String jobId = UUID.randomUUID().toString();
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
    @DisplayName("Test setting job as complete without existing result")
    void testSetComplete_WithoutExistingResult() {
        // Arrange
        String jobId = UUID.randomUUID().toString();
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
    @DisplayName("Test getting job result for non-existent job")
    void testIsComplete() {
        // Arrange
        String jobId = UUID.randomUUID().toString();
        taskManager.createTask(jobId);

        // Assert - not complete initially
        assertFalse(taskManager.isComplete(jobId));

        // Act - mark as complete
        taskManager.setComplete(jobId);

        // Assert - now complete
        assertTrue(taskManager.isComplete(jobId));
    }

    @Test
    @DisplayName("Test getting job result for non-existent job")
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
        taskManager.setFileResult(successFileJobId, "file-id", "test.pdf", "application/pdf");

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
    @DisplayName("Test cleanup of old jobs")
    void testCleanupOldJobs() throws Exception {
        // Arrange
        // 1. Create a recent completed job
        String recentJobId = "recent-job";
        taskManager.createTask(recentJobId);
        taskManager.setResult(recentJobId, "Result");

        // 2. Create an old completed job with file result
        String oldJobId = "old-job";
        taskManager.createTask(oldJobId);
        JobResult oldJob = taskManager.getJobResult(oldJobId);

        // Manually set the completion time to be older than the expiry
        LocalDateTime oldTime = LocalDateTime.now().minusHours(1);
        ReflectionTestUtils.setField(oldJob, "completedAt", oldTime);
        ReflectionTestUtils.setField(oldJob, "complete", true);

        // Create a ResultFile and set it using the new approach
        ResultFile resultFile = ResultFile.builder()
                .fileId("file-id")
                .fileName("test.pdf")
                .contentType("application/pdf")
                .fileSize(1024L)
                .build();
        ReflectionTestUtils.setField(oldJob, "resultFiles", java.util.List.of(resultFile));

        when(fileStorage.deleteFile("file-id")).thenReturn(true);

        // Obtain access to the private jobResults map
        Map<String, JobResult> jobResultsMap = (Map<String, JobResult>) ReflectionTestUtils.getField(taskManager, "jobResults");

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
    @DisplayName("Test cleanup of old jobs with no completed jobs")
    void testShutdown() throws Exception {
        // This mainly tests that the shutdown method doesn't throw exceptions
        taskManager.shutdown();

        // Verify the executor service is shutdown
        // This is difficult to test directly, but we can verify it doesn't throw exceptions
    }

    @Test
    @DisplayName("Test adding a note to a job")
    void testAddNote() {
        // Arrange
        String jobId = UUID.randomUUID().toString();
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
    @DisplayName("Test adding a note to a non-existent job")
    void testAddNote_NonExistentJob() {
        // Arrange
        String jobId = "non-existent-job";
        String note = "Test note";

        // Act
        boolean result = taskManager.addNote(jobId, note);

        // Assert
        assertFalse(result);
    }
}
