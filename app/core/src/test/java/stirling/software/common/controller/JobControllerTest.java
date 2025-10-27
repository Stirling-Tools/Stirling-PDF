package stirling.software.common.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpSession;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.common.model.job.JobResult;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.JobQueue;
import stirling.software.common.service.TaskManager;

class JobControllerTest {

    @Mock private TaskManager taskManager;

    @Mock private FileStorage fileStorage;

    @Mock private JobQueue jobQueue;

    @Mock private HttpServletRequest request;

    private MockHttpSession session;

    @InjectMocks private JobController controller;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);

        // Setup mock session for tests
        session = new MockHttpSession();
        when(request.getSession()).thenReturn(session);
    }

    @Test
    void testGetJobStatus_ExistingJob() {
        // Arrange
        String jobId = "test-job-id";
        JobResult mockResult = new JobResult();
        mockResult.setJobId(jobId);
        when(taskManager.getJobResult(jobId)).thenReturn(mockResult);

        // Act
        ResponseEntity<?> response = controller.getJobStatus(jobId);

        // Assert
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(mockResult, response.getBody());
    }

    @Test
    void testGetJobStatus_ExistingJobInQueue() {
        // Arrange
        String jobId = "test-job-id";
        JobResult mockResult = new JobResult();
        mockResult.setJobId(jobId);
        mockResult.setComplete(false);
        when(taskManager.getJobResult(jobId)).thenReturn(mockResult);
        when(jobQueue.isJobQueued(jobId)).thenReturn(true);
        when(jobQueue.getJobPosition(jobId)).thenReturn(3);

        // Act
        ResponseEntity<?> response = controller.getJobStatus(jobId);

        // Assert
        assertEquals(HttpStatus.OK, response.getStatusCode());

        @SuppressWarnings("unchecked")
        Map<String, Object> responseBody = (Map<String, Object>) response.getBody();
        assertEquals(mockResult, responseBody.get("jobResult"));

        @SuppressWarnings("unchecked")
        Map<String, Object> queueInfo = (Map<String, Object>) responseBody.get("queueInfo");
        assertTrue((Boolean) queueInfo.get("inQueue"));
        assertEquals(3, queueInfo.get("position"));
    }

    @Test
    void testGetJobStatus_NonExistentJob() {
        // Arrange
        String jobId = "non-existent-job";
        when(taskManager.getJobResult(jobId)).thenReturn(null);

        // Act
        ResponseEntity<?> response = controller.getJobStatus(jobId);

        // Assert
        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void testGetJobResult_CompletedSuccessfulWithObject() {
        // Arrange
        String jobId = "test-job-id";
        JobResult mockResult = new JobResult();
        mockResult.setJobId(jobId);
        mockResult.setComplete(true);
        String resultObject = "Test result";
        mockResult.completeWithResult(resultObject);

        when(taskManager.getJobResult(jobId)).thenReturn(mockResult);

        // Act
        ResponseEntity<?> response = controller.getJobResult(jobId);

        // Assert
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(resultObject, response.getBody());
    }

    @Test
    void testGetJobResult_CompletedSuccessfulWithFile() throws Exception {
        // Arrange
        String jobId = "test-job-id";
        String fileId = "file-id";
        String originalFileName = "test.pdf";
        String contentType = "application/pdf";
        byte[] fileContent = "Test file content".getBytes();

        JobResult mockResult = new JobResult();
        mockResult.setJobId(jobId);
        mockResult.completeWithSingleFile(
                fileId, originalFileName, contentType, fileContent.length);

        when(taskManager.getJobResult(jobId)).thenReturn(mockResult);
        when(fileStorage.retrieveBytes(fileId)).thenReturn(fileContent);

        // Act
        ResponseEntity<?> response = controller.getJobResult(jobId);

        // Assert
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(contentType, response.getHeaders().getFirst("Content-Type"));
        assertTrue(
                response.getHeaders().getFirst("Content-Disposition").contains(originalFileName));
        assertEquals(fileContent, response.getBody());
    }

    @Test
    void testGetJobResult_CompletedWithError() {
        // Arrange
        String jobId = "test-job-id";
        String errorMessage = "Test error";

        JobResult mockResult = new JobResult();
        mockResult.setJobId(jobId);
        mockResult.failWithError(errorMessage);

        when(taskManager.getJobResult(jobId)).thenReturn(mockResult);

        // Act
        ResponseEntity<?> response = controller.getJobResult(jobId);

        // Assert
        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertTrue(response.getBody().toString().contains(errorMessage));
    }

    @Test
    void testGetJobResult_IncompleteJob() {
        // Arrange
        String jobId = "test-job-id";

        JobResult mockResult = new JobResult();
        mockResult.setJobId(jobId);
        mockResult.setComplete(false);

        when(taskManager.getJobResult(jobId)).thenReturn(mockResult);

        // Act
        ResponseEntity<?> response = controller.getJobResult(jobId);

        // Assert
        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertTrue(response.getBody().toString().contains("not complete"));
    }

    @Test
    void testGetJobResult_NonExistentJob() {
        // Arrange
        String jobId = "non-existent-job";
        when(taskManager.getJobResult(jobId)).thenReturn(null);

        // Act
        ResponseEntity<?> response = controller.getJobResult(jobId);

        // Assert
        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void testGetJobResult_ErrorRetrievingFile() throws Exception {
        // Arrange
        String jobId = "test-job-id";
        String fileId = "file-id";
        String originalFileName = "test.pdf";
        String contentType = "application/pdf";

        JobResult mockResult = new JobResult();
        mockResult.setJobId(jobId);
        mockResult.completeWithSingleFile(fileId, originalFileName, contentType, 1024L);

        when(taskManager.getJobResult(jobId)).thenReturn(mockResult);
        when(fileStorage.retrieveBytes(fileId)).thenThrow(new RuntimeException("File not found"));

        // Act
        ResponseEntity<?> response = controller.getJobResult(jobId);

        // Assert
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        assertTrue(response.getBody().toString().contains("Error retrieving file"));
    }

    /*
     * @Test void testGetJobStats() { // Arrange JobStats mockStats =
     * JobStats.builder() .totalJobs(10) .activeJobs(3) .completedJobs(7) .build();
     *
     * when(taskManager.getJobStats()).thenReturn(mockStats);
     *
     * // Act ResponseEntity<?> response = controller.getJobStats();
     *
     * // Assert assertEquals(HttpStatus.OK, response.getStatusCode());
     * assertEquals(mockStats, response.getBody()); }
     *
     * @Test void testCleanupOldJobs() { // Arrange when(taskManager.getJobStats())
     * .thenReturn(JobStats.builder().totalJobs(10).build())
     * .thenReturn(JobStats.builder().totalJobs(7).build());
     *
     * // Act ResponseEntity<?> response = controller.cleanupOldJobs();
     *
     * // Assert assertEquals(HttpStatus.OK, response.getStatusCode());
     *
     * @SuppressWarnings("unchecked") Map<String, Object> responseBody =
     * (Map<String, Object>) response.getBody(); assertEquals("Cleanup complete",
     * responseBody.get("message")); assertEquals(3,
     * responseBody.get("removedJobs")); assertEquals(7,
     * responseBody.get("remainingJobs"));
     *
     * verify(taskManager).cleanupOldJobs(); }
     *
     * @Test void testGetQueueStats() { // Arrange Map<String, Object>
     * mockQueueStats = Map.of( "queuedJobs", 5, "queueCapacity", 10,
     * "resourceStatus", "OK" );
     *
     * when(jobQueue.getQueueStats()).thenReturn(mockQueueStats);
     *
     * // Act ResponseEntity<?> response = controller.getQueueStats();
     *
     * // Assert assertEquals(HttpStatus.OK, response.getStatusCode());
     * assertEquals(mockQueueStats, response.getBody());
     * verify(jobQueue).getQueueStats(); }
     */
    @Test
    void testCancelJob_InQueue() {
        // Arrange
        String jobId = "job-in-queue";

        // Setup user session with job authorization
        java.util.Set<String> userJobIds = new java.util.HashSet<>();
        userJobIds.add(jobId);
        session.setAttribute("userJobIds", userJobIds);

        when(jobQueue.isJobQueued(jobId)).thenReturn(true);
        when(jobQueue.getJobPosition(jobId)).thenReturn(2);
        when(jobQueue.cancelJob(jobId)).thenReturn(true);

        // Act
        ResponseEntity<?> response = controller.cancelJob(jobId);

        // Assert
        assertEquals(HttpStatus.OK, response.getStatusCode());

        @SuppressWarnings("unchecked")
        Map<String, Object> responseBody = (Map<String, Object>) response.getBody();
        assertEquals("Job cancelled successfully", responseBody.get("message"));
        assertTrue((Boolean) responseBody.get("wasQueued"));
        assertEquals(2, responseBody.get("queuePosition"));

        verify(jobQueue).cancelJob(jobId);
        verify(taskManager, never()).setError(anyString(), anyString());
    }

    @Test
    void testCancelJob_Running() {
        // Arrange
        String jobId = "job-running";
        JobResult jobResult = new JobResult();
        jobResult.setJobId(jobId);
        jobResult.setComplete(false);

        // Setup user session with job authorization
        java.util.Set<String> userJobIds = new java.util.HashSet<>();
        userJobIds.add(jobId);
        session.setAttribute("userJobIds", userJobIds);

        when(jobQueue.isJobQueued(jobId)).thenReturn(false);
        when(taskManager.getJobResult(jobId)).thenReturn(jobResult);

        // Act
        ResponseEntity<?> response = controller.cancelJob(jobId);

        // Assert
        assertEquals(HttpStatus.OK, response.getStatusCode());

        @SuppressWarnings("unchecked")
        Map<String, Object> responseBody = (Map<String, Object>) response.getBody();
        assertEquals("Job cancelled successfully", responseBody.get("message"));
        assertFalse((Boolean) responseBody.get("wasQueued"));
        assertEquals("n/a", responseBody.get("queuePosition"));

        verify(jobQueue, never()).cancelJob(jobId);
        verify(taskManager).setError(jobId, "Job was cancelled by user");
    }

    @Test
    void testCancelJob_NotFound() {
        // Arrange
        String jobId = "non-existent-job";

        // Setup user session with job authorization
        java.util.Set<String> userJobIds = new java.util.HashSet<>();
        userJobIds.add(jobId);
        session.setAttribute("userJobIds", userJobIds);

        when(jobQueue.isJobQueued(jobId)).thenReturn(false);
        when(taskManager.getJobResult(jobId)).thenReturn(null);

        // Act
        ResponseEntity<?> response = controller.cancelJob(jobId);

        // Assert
        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void testCancelJob_AlreadyComplete() {
        // Arrange
        String jobId = "completed-job";
        JobResult jobResult = new JobResult();
        jobResult.setJobId(jobId);
        jobResult.setComplete(true);

        // Setup user session with job authorization
        java.util.Set<String> userJobIds = new java.util.HashSet<>();
        userJobIds.add(jobId);
        session.setAttribute("userJobIds", userJobIds);

        when(jobQueue.isJobQueued(jobId)).thenReturn(false);
        when(taskManager.getJobResult(jobId)).thenReturn(jobResult);

        // Act
        ResponseEntity<?> response = controller.cancelJob(jobId);

        // Assert
        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());

        @SuppressWarnings("unchecked")
        Map<String, Object> responseBody = (Map<String, Object>) response.getBody();
        assertEquals("Cannot cancel job that is already complete", responseBody.get("message"));
    }

    @Test
    void testCancelJob_Unauthorized() {
        // Arrange
        String jobId = "unauthorized-job";

        // Setup user session with other job IDs but not this one
        java.util.Set<String> userJobIds = new java.util.HashSet<>();
        userJobIds.add("other-job-1");
        userJobIds.add("other-job-2");
        session.setAttribute("userJobIds", userJobIds);

        // Act
        ResponseEntity<?> response = controller.cancelJob(jobId);

        // Assert
        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());

        @SuppressWarnings("unchecked")
        Map<String, Object> responseBody = (Map<String, Object>) response.getBody();
        assertEquals("You are not authorized to cancel this job", responseBody.get("message"));

        // Verify no cancellation attempts were made
        verify(jobQueue, never()).isJobQueued(anyString());
        verify(jobQueue, never()).cancelJob(anyString());
        verify(taskManager, never()).getJobResult(anyString());
        verify(taskManager, never()).setError(anyString(), anyString());
    }
}
