package stirling.software.common.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;


import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
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

@DisplayName("JobController Tests")
public class JobControllerTest {

    @Mock
    private TaskManager taskManager;

    @Mock
    private FileStorage fileStorage;

    @Mock
    private JobQueue jobQueue;

    @Mock
    private HttpServletRequest request;

    private MockHttpSession session;

    @InjectMocks
    private JobController controller;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);

        // Setup mock session for tests
        session = new MockHttpSession();
        when(request.getSession()).thenReturn(session);
    }

    @Nested
    @DisplayName("Job Status Retrieval Tests")
    class JobStatusRetrievalTests {

        @Test
        @DisplayName("Returns OK with job result for existing job")
        void testGetJobStatus_ExistingJob() {
            // Arrange
            String jobId = "test-job-id";
            JobResult mockResult = new JobResult();
            mockResult.setJobId(jobId);
            when(taskManager.getJobResult(jobId)).thenReturn(mockResult);

            // Act
            ResponseEntity<?> response = controller.getJobStatus(jobId);

            // Assert
            assertEquals(HttpStatus.OK, response.getStatusCode(), "Status code should be OK");
            assertEquals(mockResult, response.getBody(), "Response body should match job result");
        }

        @Test
        @DisplayName("Returns OK with queue info for existing job in queue")
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
            assertEquals(HttpStatus.OK, response.getStatusCode(), "Status code should be OK");

            @SuppressWarnings("unchecked")
            Map<String, Object> responseBody = (Map<String, Object>) response.getBody();
            assertEquals(mockResult, responseBody.get("jobResult"), "Job result should match");

            @SuppressWarnings("unchecked")
            Map<String, Object> queueInfo = (Map<String, Object>) responseBody.get("queueInfo");
            assertTrue((Boolean) queueInfo.get("inQueue"), "Job should be marked as in queue");
            assertEquals(3, queueInfo.get("position"), "Queue position should match");
        }

        @Test
        @DisplayName("Returns NOT_FOUND for non-existent job")
        void testGetJobStatus_NonExistentJob() {
            // Arrange
            String jobId = "non-existent-job";
            when(taskManager.getJobResult(jobId)).thenReturn(null);

            // Act
            ResponseEntity<?> response = controller.getJobStatus(jobId);

            // Assert
            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode(), "Status code should be NOT_FOUND");
        }
    }

    @Nested
    @DisplayName("Job Result Retrieval Tests")
    class JobResultRetrievalTests {

        @Test
        @DisplayName("Returns OK with result object for completed successful job with object")
        void testGetJobResult_CompletedSuccessfulWithObject() {
            // Arrange
            String jobId = "test-job-id";
            JobResult mockResult = new JobResult();
            mockResult.setJobId(jobId);
            String resultObject = "Test result";
            mockResult.completeWithResult(resultObject);

            when(taskManager.getJobResult(jobId)).thenReturn(mockResult);

            // Act
            ResponseEntity<?> response = controller.getJobResult(jobId);

            // Assert
            assertEquals(HttpStatus.OK, response.getStatusCode(), "Status code should be OK");
            assertEquals(resultObject, response.getBody(), "Response body should match result object");
        }

        @Test
        @DisplayName("Returns OK with file content for completed successful job with file")
        void testGetJobResult_CompletedSuccessfulWithFile() throws Exception {
            // Arrange
            String jobId = "test-job-id";
            String fileId = "file-id";
            String originalFileName = "test.pdf";
            String contentType = "application/pdf";
            byte[] fileContent = "Test file content".getBytes();

            JobResult mockResult = new JobResult();
            mockResult.setJobId(jobId);
            mockResult.completeWithSingleFile(fileId, originalFileName, contentType, fileContent.length);

            when(taskManager.getJobResult(jobId)).thenReturn(mockResult);
            when(fileStorage.retrieveBytes(fileId)).thenReturn(fileContent);

            // Act
            ResponseEntity<?> response = controller.getJobResult(jobId);

            // Assert
            assertEquals(HttpStatus.OK, response.getStatusCode(), "Status code should be OK");
            assertEquals(contentType, response.getHeaders().getFirst("Content-Type"), "Content type should match");
            assertTrue(response.getHeaders().getFirst("Content-Disposition").contains(originalFileName),
                "Content disposition should contain original file name");
            assertEquals(fileContent, response.getBody(), "Response body should match file content");
        }

        @Test
        @DisplayName("Returns BAD_REQUEST with error message for completed job with error")
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
            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode(), "Status code should be BAD_REQUEST");
            assertTrue(response.getBody().toString().contains(errorMessage), "Response body should contain error message");
        }

        @Test
        @DisplayName("Returns BAD_REQUEST for incomplete job")
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
            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode(), "Status code should be BAD_REQUEST");
            assertTrue(response.getBody().toString().contains("not complete"), "Response body should indicate job is not complete");
        }

        @Test
        @DisplayName("Returns NOT_FOUND for non-existent job")
        void testGetJobResult_NonExistentJob() {
            // Arrange
            String jobId = "non-existent-job";
            when(taskManager.getJobResult(jobId)).thenReturn(null);

            // Act
            ResponseEntity<?> response = controller.getJobResult(jobId);

            // Assert
            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode(), "Status code should be NOT_FOUND");
        }

        @Test
        @DisplayName("Returns INTERNAL_SERVER_ERROR when error occurs retrieving file")
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
            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode(), "Status code should be INTERNAL_SERVER_ERROR");
            assertTrue(response.getBody().toString().contains("Error retrieving file"), "Response body should indicate file retrieval error");
        }
    }

    @Nested
    @DisplayName("Job Cancellation Tests")
    class JobCancellationTests {

        @Test
        @DisplayName("Returns OK and cancels job when job is in queue")
        void testCancelJob_InQueue() {
            // Arrange
            String jobId = "job-in-queue";

            // Setup user session with job authorization
            Set<String> userJobIds = new HashSet<>();
            userJobIds.add(jobId);
            session.setAttribute("userJobIds", userJobIds);

            when(jobQueue.isJobQueued(jobId)).thenReturn(true);
            when(jobQueue.getJobPosition(jobId)).thenReturn(2);
            when(jobQueue.cancelJob(jobId)).thenReturn(true);

            // Act
            ResponseEntity<?> response = controller.cancelJob(jobId);

            // Assert
            assertEquals(HttpStatus.OK, response.getStatusCode(), "Status code should be OK");

            @SuppressWarnings("unchecked")
            Map<String, Object> responseBody = (Map<String, Object>) response.getBody();
            assertEquals("Job cancelled successfully", responseBody.get("message"), "Message should indicate successful cancellation");
            assertTrue((Boolean) responseBody.get("wasQueued"), "Should indicate job was in queue");
            assertEquals(2, responseBody.get("queuePosition"), "Queue position should match");

            verify(jobQueue).cancelJob(jobId);
            verify(taskManager, never()).setError(anyString(), anyString());
        }

        @Test
        @DisplayName("Returns OK and sets error for running job")
        void testCancelJob_Running() {
            // Arrange
            String jobId = "job-running";
            JobResult jobResult = new JobResult();
            jobResult.setJobId(jobId);
            jobResult.setComplete(false);

            // Setup user session with job authorization
            Set<String> userJobIds = new HashSet<>();
            userJobIds.add(jobId);
            session.setAttribute("userJobIds", userJobIds);

            when(jobQueue.isJobQueued(jobId)).thenReturn(false);
            when(taskManager.getJobResult(jobId)).thenReturn(jobResult);

            // Act
            ResponseEntity<?> response = controller.cancelJob(jobId);

            // Assert
            assertEquals(HttpStatus.OK, response.getStatusCode(), "Status code should be OK");

            @SuppressWarnings("unchecked")
            Map<String, Object> responseBody = (Map<String, Object>) response.getBody();
            assertEquals("Job cancelled successfully", responseBody.get("message"), "Message should indicate successful cancellation");
            assertFalse((Boolean) responseBody.get("wasQueued"), "Should indicate job was not in queue");
            assertEquals("n/a", responseBody.get("queuePosition"), "Queue position should be 'n/a' for running jobs");

            verify(jobQueue, never()).cancelJob(jobId);
            verify(taskManager).setError(jobId, "Job was cancelled by user");
        }

        @Test
        @DisplayName("Returns NOT_FOUND for non-existent job")
        void testCancelJob_NotFound() {
            // Arrange
            String jobId = "non-existent-job";

            // Setup user session with job authorization
            Set<String> userJobIds = new HashSet<>();
            userJobIds.add(jobId);
            session.setAttribute("userJobIds", userJobIds);

            when(jobQueue.isJobQueued(jobId)).thenReturn(false);
            when(taskManager.getJobResult(jobId)).thenReturn(null);

            // Act
            ResponseEntity<?> response = controller.cancelJob(jobId);

            // Assert
            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode(), "Status code should be NOT_FOUND");
        }

        @Test
        @DisplayName("Returns BAD_REQUEST for already complete job")
        void testCancelJob_AlreadyComplete() {
            // Arrange
            String jobId = "completed-job";
            JobResult jobResult = new JobResult();
            jobResult.setJobId(jobId);
            jobResult.setComplete(true);

            // Setup user session with job authorization
            Set<String> userJobIds = new HashSet<>();
            userJobIds.add(jobId);
            session.setAttribute("userJobIds", userJobIds);

            when(jobQueue.isJobQueued(jobId)).thenReturn(false);
            when(taskManager.getJobResult(jobId)).thenReturn(jobResult);

            // Act
            ResponseEntity<?> response = controller.cancelJob(jobId);

            // Assert
            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode(), "Status code should be BAD_REQUEST");

            @SuppressWarnings("unchecked")
            Map<String, Object> responseBody = (Map<String, Object>) response.getBody();
            assertEquals("Cannot cancel job that is already complete", responseBody.get("message"),
                "Message should indicate job is already complete");
        }

        @Test
        @DisplayName("Returns FORBIDDEN for unauthorized job cancellation")
        void testCancelJob_Unauthorized() {
            // Arrange
            String jobId = "unauthorized-job";

            // Setup user session with other job IDs but not this one
            Set<String> userJobIds = new HashSet<>();
            userJobIds.add("other-job-1");
            userJobIds.add("other-job-2");
            session.setAttribute("userJobIds", userJobIds);

            // Act
            ResponseEntity<?> response = controller.cancelJob(jobId);

            // Assert
            assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode(), "Status code should be FORBIDDEN");

            @SuppressWarnings("unchecked")
            Map<String, Object> responseBody = (Map<String, Object>) response.getBody();
            assertEquals("You are not authorized to cancel this job", responseBody.get("message"),
                "Message should indicate unauthorized access");

            // Verify no cancellation attempts were made
            verify(jobQueue, never()).isJobQueued(anyString());
            verify(jobQueue, never()).cancelJob(anyString());
            verify(taskManager, never()).getJobResult(anyString());
            verify(taskManager, never()).setError(anyString(), anyString());
        }
    }
}
