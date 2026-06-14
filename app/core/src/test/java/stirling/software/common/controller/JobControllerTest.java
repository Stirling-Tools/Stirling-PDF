package stirling.software.common.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import jakarta.enterprise.inject.Instance;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.core.Response;

import stirling.software.common.cluster.ClusterBackplane;
import stirling.software.common.cluster.JobStore;
import stirling.software.common.model.job.JobResult;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.service.JobQueue;
import stirling.software.common.service.TaskManager;
import stirling.software.common.testsupport.ReflectionTestUtils;

/**
 * Migration: {@link JobController} now returns {@code jakarta.ws.rs.core.Response} (not Spring
 * {@code ResponseEntity}); authorization is driven by a CDI {@code Instance<JobOwnershipService>}
 * (not an {@code HttpSession} "userJobIds" attribute), and the sticky/ownership guard reads the
 * cluster {@link JobStore}. With ownership disabled (unresolvable JobOwnershipService) every job is
 * accessible, matching the security-disabled contract. The JobStore is stubbed to return {@code
 * Optional.empty()} so the sticky-410 guard is a no-op on these single-node unit paths.
 */
class JobControllerTest {

    @Mock private TaskManager taskManager;

    @Mock private FileStorage fileStorage;

    @Mock private JobQueue jobQueue;

    @Mock private HttpServletRequest request;

    @Mock private JobOwnershipService jobOwnershipService;

    @Mock private ClusterBackplane clusterBackplane;

    @Mock private JobStore jobStore;

    @InjectMocks private JobController controller;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        // Sticky-410 guard short-circuits to "not peer-owned" when the JobStore has no entry.
        lenient().when(jobStore.get(anyString())).thenReturn(Optional.empty());
        // @Inject Instance<> fields are not populated by Mockito; default them to unresolvable
        // (security disabled / no sticky recorder) so validateJobAccess() and the guard don't NPE.
        ReflectionTestUtils.setField(controller, "jobOwnershipService", unresolvable());
        ReflectionTestUtils.setField(controller, "stickyMissRecorder", unresolvable());
    }

    @SuppressWarnings("unchecked")
    private static <T> Instance<T> unresolvable() {
        Instance<T> instance = mock(Instance.class);
        lenient().when(instance.isResolvable()).thenReturn(false);
        return instance;
    }

    /** Wrap a JobOwnershipService in a resolvable CDI Instance (security enabled). */
    @SuppressWarnings("unchecked")
    private Instance<JobOwnershipService> resolvableOwnership() {
        Instance<JobOwnershipService> instance = mock(Instance.class);
        when(instance.isResolvable()).thenReturn(true);
        when(instance.get()).thenReturn(jobOwnershipService);
        return instance;
    }

    @Test
    void testGetJobStatus_ExistingJob() {
        // Arrange
        String jobId = "test-job-id";
        JobResult mockResult = new JobResult();
        mockResult.setJobId(jobId);
        when(taskManager.getJobResult(jobId)).thenReturn(mockResult);

        // Act
        Response response = controller.getJobStatus(jobId);

        // Assert
        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(mockResult, response.getEntity());
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
        Response response = controller.getJobStatus(jobId);

        // Assert
        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());

        @SuppressWarnings("unchecked")
        Map<String, Object> responseBody = (Map<String, Object>) response.getEntity();
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
        Response response = controller.getJobStatus(jobId);

        // Assert
        assertEquals(Response.Status.NOT_FOUND.getStatusCode(), response.getStatus());
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
        Response response = controller.getJobResult(jobId);

        // Assert
        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(resultObject, response.getEntity());
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
        Response response = controller.getJobResult(jobId);

        // Assert
        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(contentType, response.getHeaderString("Content-Type"));
        assertTrue(response.getHeaderString("Content-Disposition").contains(originalFileName));
        assertEquals(fileContent, response.getEntity());
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
        Response response = controller.getJobResult(jobId);

        // Assert
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
        assertTrue(response.getEntity().toString().contains(errorMessage));
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
        Response response = controller.getJobResult(jobId);

        // Assert
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
        assertTrue(response.getEntity().toString().contains("not complete"));
    }

    @Test
    void testGetJobResult_NonExistentJob() {
        // Arrange
        String jobId = "non-existent-job";
        when(taskManager.getJobResult(jobId)).thenReturn(null);

        // Act
        Response response = controller.getJobResult(jobId);

        // Assert
        assertEquals(Response.Status.NOT_FOUND.getStatusCode(), response.getStatus());
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
        Response response = controller.getJobResult(jobId);

        // Assert
        assertEquals(Response.Status.INTERNAL_SERVER_ERROR.getStatusCode(), response.getStatus());
        assertTrue(response.getEntity().toString().contains("Error retrieving file"));
    }

    @Test
    void testCancelJob_InQueue() {
        // Arrange
        String jobId = "job-in-queue";

        when(jobQueue.isJobQueued(jobId)).thenReturn(true);
        when(jobQueue.getJobPosition(jobId)).thenReturn(2);
        when(jobQueue.cancelJob(jobId)).thenReturn(true);

        // Act
        Response response = controller.cancelJob(jobId);

        // Assert
        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());

        @SuppressWarnings("unchecked")
        Map<String, Object> responseBody = (Map<String, Object>) response.getEntity();
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

        when(jobQueue.isJobQueued(jobId)).thenReturn(false);
        when(taskManager.getJobResult(jobId)).thenReturn(jobResult);

        // Act
        Response response = controller.cancelJob(jobId);

        // Assert
        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());

        @SuppressWarnings("unchecked")
        Map<String, Object> responseBody = (Map<String, Object>) response.getEntity();
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

        when(jobQueue.isJobQueued(jobId)).thenReturn(false);
        when(taskManager.getJobResult(jobId)).thenReturn(null);

        // Act
        Response response = controller.cancelJob(jobId);

        // Assert
        assertEquals(Response.Status.NOT_FOUND.getStatusCode(), response.getStatus());
    }

    @Test
    void testCancelJob_AlreadyComplete() {
        // Arrange
        String jobId = "completed-job";
        JobResult jobResult = new JobResult();
        jobResult.setJobId(jobId);
        jobResult.setComplete(true);

        when(jobQueue.isJobQueued(jobId)).thenReturn(false);
        when(taskManager.getJobResult(jobId)).thenReturn(jobResult);

        // Act
        Response response = controller.cancelJob(jobId);

        // Assert
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());

        @SuppressWarnings("unchecked")
        Map<String, Object> responseBody = (Map<String, Object>) response.getEntity();
        assertEquals("Cannot cancel job that is already complete", responseBody.get("message"));
    }

    @Test
    void testCancelJob_SecurityDisabledAllowsAccess() {
        // With ownership disabled (unresolvable JobOwnershipService), all jobs are accessible.
        String jobId = "unauthorized-job";
        JobResult jobResult = new JobResult();
        jobResult.setJobId(jobId);
        jobResult.setComplete(false);

        when(jobQueue.isJobQueued(jobId)).thenReturn(false);
        when(taskManager.getJobResult(jobId)).thenReturn(jobResult);

        // Act - without security enabled, this will succeed
        Response response = controller.cancelJob(jobId);

        // Assert - when security is disabled, all jobs are accessible
        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());

        @SuppressWarnings("unchecked")
        Map<String, Object> responseBody = (Map<String, Object>) response.getEntity();
        assertEquals("Job cancelled successfully", responseBody.get("message"));

        verify(taskManager).setError(jobId, "Job was cancelled by user");
    }

    @Test
    void testDownloadFile_ForbiddenWhenFileOwnedByAnotherUser() throws Exception {
        String fileId = "file-id";

        ReflectionTestUtils.setField(controller, "jobOwnershipService", resolvableOwnership());
        when(taskManager.findJobKeyByFileId(fileId)).thenReturn("other-user:job-id");
        when(jobOwnershipService.validateJobAccess("other-user:job-id")).thenReturn(false);

        Response response = controller.downloadFile(fileId);

        assertEquals(Response.Status.FORBIDDEN.getStatusCode(), response.getStatus());
        verify(fileStorage, never()).retrieveBytes(eq(fileId));
    }

    @Test
    void testGetFileMetadata_ForbiddenWhenFileOwnedByAnotherUser() throws Exception {
        String fileId = "file-id";

        ReflectionTestUtils.setField(controller, "jobOwnershipService", resolvableOwnership());
        when(taskManager.findJobKeyByFileId(fileId)).thenReturn("other-user:job-id");
        when(jobOwnershipService.validateJobAccess("other-user:job-id")).thenReturn(false);

        Response response = controller.getFileMetadata(fileId);

        assertEquals(Response.Status.FORBIDDEN.getStatusCode(), response.getStatus());
        verify(fileStorage, never()).getFileSize(eq(fileId));
    }
}
