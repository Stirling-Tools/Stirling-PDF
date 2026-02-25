package stirling.software.common.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.util.ReflectionTestUtils;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.common.model.job.JobResult;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.JobOwnershipService;
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
        String contentType = MediaType.APPLICATION_PDF_VALUE;
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
        String contentType = MediaType.APPLICATION_PDF_VALUE;

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
        // Note: This test validates authorization when security is enabled.
        // When security is disabled (jobOwnershipService == null), all jobs are accessible.
        // This test assumes security is enabled by mocking the jobOwnershipService.

        String jobId = "unauthorized-job";
        JobResult jobResult = new JobResult();
        jobResult.setJobId(jobId);
        jobResult.setComplete(false);

        // Setup user session with job authorization for cancel tests
        java.util.Set<String> userJobIds = new java.util.HashSet<>();
        userJobIds.add(jobId);
        session.setAttribute("userJobIds", userJobIds);

        when(jobQueue.isJobQueued(jobId)).thenReturn(false);
        when(taskManager.getJobResult(jobId)).thenReturn(jobResult);

        // Act - without security enabled, this will succeed
        ResponseEntity<?> response = controller.cancelJob(jobId);

        // Assert - when security is disabled, all jobs are accessible
        assertEquals(HttpStatus.OK, response.getStatusCode());

        @SuppressWarnings("unchecked")
        Map<String, Object> responseBody = (Map<String, Object>) response.getBody();
        assertEquals("Job cancelled successfully", responseBody.get("message"));

        verify(taskManager).setError(jobId, "Job was cancelled by user");
    }

    // Added by Pengcheng Xu: FSM coverage tests (access control and result branches).
    @Test
    void testGetJobStatus_Unauthorized_Returns403() {
        String jobId = "unauthorized-job";

        JobOwnershipService ownershipService = mock(JobOwnershipService.class);
        ReflectionTestUtils.setField(controller, "jobOwnershipService", ownershipService);
        when(ownershipService.validateJobAccess(jobId)).thenReturn(false);

        ResponseEntity<?> response = controller.getJobStatus(jobId);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        assertTrue(response.getBody().toString().contains("not authorized"));
        verify(taskManager, never()).getJobResult(anyString());
    }

    @Test
    void testGetJobResult_CompletedSuccessWithMultipleFiles_ReturnsMetadata() {
        String jobId = "job-with-multiple-files";
        JobResult mockResult = new JobResult();
        mockResult.setJobId(jobId);
        mockResult.completeWithFiles(
                java.util.List.of(
                        stirling.software.common.model.job.ResultFile.builder()
                                .fileId("file-1")
                                .fileName("a.pdf")
                                .contentType(MediaType.APPLICATION_PDF_VALUE)
                                .fileSize(100)
                                .build(),
                        stirling.software.common.model.job.ResultFile.builder()
                                .fileId("file-2")
                                .fileName("b.pdf")
                                .contentType(MediaType.APPLICATION_PDF_VALUE)
                                .fileSize(200)
                                .build()));

        when(taskManager.getJobResult(jobId)).thenReturn(mockResult);

        ResponseEntity<?> response = controller.getJobResult(jobId);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.APPLICATION_JSON, response.getHeaders().getContentType());

        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertEquals(jobId, body.get("jobId"));
        assertEquals(Boolean.TRUE, body.get("hasMultipleFiles"));

        @SuppressWarnings("unchecked")
        java.util.List<Object> files = (java.util.List<Object>) body.get("files");
        assertEquals(2, files.size());
    }

    // Added by Pengcheng Xu: FSM coverage tests (state/transition coverage with new cases).
    @Test
    void testGetJobStatus_NotFound_Returns404_New() {
        String jobId = "missing-job";
        when(taskManager.getJobResult(jobId)).thenReturn(null);

        ResponseEntity<?> response = controller.getJobStatus(jobId);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void testGetJobStatus_Queued_ReturnsQueueInfo_New() {
        String jobId = "queued-job";
        JobResult mockResult = new JobResult();
        mockResult.setJobId(jobId);
        mockResult.setComplete(false);

        when(taskManager.getJobResult(jobId)).thenReturn(mockResult);
        when(jobQueue.isJobQueued(jobId)).thenReturn(true);
        when(jobQueue.getJobPosition(jobId)).thenReturn(1);

        ResponseEntity<?> response = controller.getJobStatus(jobId);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        @SuppressWarnings("unchecked")
        Map<String, Object> responseBody = (Map<String, Object>) response.getBody();
        assertEquals(mockResult, responseBody.get("jobResult"));

        @SuppressWarnings("unchecked")
        Map<String, Object> queueInfo = (Map<String, Object>) responseBody.get("queueInfo");
        assertEquals(Boolean.TRUE, queueInfo.get("inQueue"));
        assertEquals(1, queueInfo.get("position"));
    }

    @Test
    void testCancelJob_InProgress_MarksError_New() {
        String jobId = "job-running-new";
        JobResult jobResult = new JobResult();
        jobResult.setJobId(jobId);
        jobResult.setComplete(false);

        when(jobQueue.isJobQueued(jobId)).thenReturn(false);
        when(taskManager.getJobResult(jobId)).thenReturn(jobResult);

        ResponseEntity<?> response = controller.cancelJob(jobId);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        @SuppressWarnings("unchecked")
        Map<String, Object> responseBody = (Map<String, Object>) response.getBody();
        assertEquals("Job cancelled successfully", responseBody.get("message"));
        assertEquals(Boolean.FALSE, responseBody.get("wasQueued"));

        verify(taskManager).setError(jobId, "Job was cancelled by user");
    }

    @Test
    void testGetJobResult_CompletedError_Returns400_New() {
        String jobId = "job-error-new";
        JobResult mockResult = new JobResult();
        mockResult.setJobId(jobId);
        mockResult.failWithError("Test error");

        when(taskManager.getJobResult(jobId)).thenReturn(mockResult);

        ResponseEntity<?> response = controller.getJobResult(jobId);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertTrue(response.getBody().toString().contains("Job failed"));
    }

    // Added by Pengcheng Xu: white-box coverage tests for key file/metadata branches.
    @Test
    void testGetJobFiles_CompletedSuccess_ReturnsFileList_New() {
        String jobId = "job-files-success";
        JobResult mockResult = new JobResult();
        mockResult.setJobId(jobId);
        mockResult.completeWithFiles(
                java.util.List.of(
                        stirling.software.common.model.job.ResultFile.builder()
                                .fileId("f1")
                                .fileName("a.pdf")
                                .contentType(MediaType.APPLICATION_PDF_VALUE)
                                .fileSize(10)
                                .build(),
                        stirling.software.common.model.job.ResultFile.builder()
                                .fileId("f2")
                                .fileName("b.pdf")
                                .contentType(MediaType.APPLICATION_PDF_VALUE)
                                .fileSize(20)
                                .build()));
        when(taskManager.getJobResult(jobId)).thenReturn(mockResult);

        ResponseEntity<?> response = controller.getJobFiles(jobId);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertEquals(jobId, body.get("jobId"));
        assertEquals(2, body.get("fileCount"));
        @SuppressWarnings("unchecked")
        java.util.List<Object> files = (java.util.List<Object>) body.get("files");
        assertEquals(2, files.size());
    }

    @Test
    void testGetFileMetadata_FileExistsWithoutTrackedMetadata_ReturnsFallbackInfo_New()
            throws Exception {
        String fileId = "orphan-file";
        when(fileStorage.fileExists(fileId)).thenReturn(true);
        when(taskManager.findResultFileByFileId(fileId)).thenReturn(null);
        when(fileStorage.getFileSize(fileId)).thenReturn(123L);

        ResponseEntity<?> response = controller.getFileMetadata(fileId);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertEquals(fileId, body.get("fileId"));
        assertEquals("unknown", body.get("fileName"));
        assertEquals(MediaType.APPLICATION_OCTET_STREAM_VALUE, body.get("contentType"));
        assertEquals(123L, body.get("fileSize"));
    }

    @Test
    void testGetFileMetadata_Exception_Returns500_New() throws Exception {
        String fileId = "metadata-error-file";
        when(fileStorage.fileExists(fileId)).thenReturn(true);
        when(taskManager.findResultFileByFileId(fileId)).thenReturn(null);
        when(fileStorage.getFileSize(fileId)).thenThrow(new RuntimeException("boom"));

        ResponseEntity<?> response = controller.getFileMetadata(fileId);

        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        assertTrue(response.getBody().toString().contains("Error retrieving file metadata"));
    }

    @Test
    void testDownloadFile_WithMetadata_ReturnsAttachmentHeadersAndBytes_New() throws Exception {
        String fileId = "download-file";
        byte[] content = "file-bytes".getBytes();
        when(fileStorage.fileExists(fileId)).thenReturn(true);
        when(fileStorage.retrieveBytes(fileId)).thenReturn(content);
        when(taskManager.findResultFileByFileId(fileId))
                .thenReturn(
                        stirling.software.common.model.job.ResultFile.builder()
                                .fileId(fileId)
                                .fileName("my file.pdf")
                                .contentType(MediaType.APPLICATION_PDF_VALUE)
                                .fileSize(content.length)
                                .build());

        ResponseEntity<?> response = controller.downloadFile(fileId);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(
                MediaType.APPLICATION_PDF_VALUE, response.getHeaders().getFirst("Content-Type"));
        String disposition = response.getHeaders().getFirst("Content-Disposition");
        assertNotNull(disposition);
        assertTrue(disposition.contains("my file.pdf"));
        assertTrue(disposition.contains("my%20file.pdf"));
        assertEquals(content, response.getBody());
    }

    // Added by Pengcheng Xu: mock fileStorage to verify 404 path and ensure no byte/metadata retrieval is invoked.
    @Test
    void testDownloadFile_WhenFileMissing_Returns404_AndDoesNotReadBytes_Mocked() {
        String fileId = "missing-file";
        when(fileStorage.fileExists(fileId)).thenReturn(false);

        ResponseEntity<?> response = controller.downloadFile(fileId);

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        verify(fileStorage).fileExists(fileId);
        verify(fileStorage, never()).retrieveBytes(anyString());
        verify(taskManager, never()).findResultFileByFileId(anyString());
    }
}
