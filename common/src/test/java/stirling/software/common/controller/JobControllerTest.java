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

import stirling.software.common.model.job.JobResult;
import stirling.software.common.model.job.JobStats;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.TaskManager;

class JobControllerTest {

    @Mock
    private TaskManager taskManager;
    
    @Mock
    private FileStorage fileStorage;
    
    @InjectMocks
    private JobController controller;
    
    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
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
        mockResult.completeWithFile(fileId, originalFileName, contentType);
        
        when(taskManager.getJobResult(jobId)).thenReturn(mockResult);
        when(fileStorage.retrieveBytes(fileId)).thenReturn(fileContent);
        
        // Act
        ResponseEntity<?> response = controller.getJobResult(jobId);
        
        // Assert
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(contentType, response.getHeaders().getFirst("Content-Type"));
        assertTrue(response.getHeaders().getFirst("Content-Disposition").contains(originalFileName));
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
        mockResult.completeWithFile(fileId, originalFileName, contentType);
        
        when(taskManager.getJobResult(jobId)).thenReturn(mockResult);
        when(fileStorage.retrieveBytes(fileId)).thenThrow(new RuntimeException("File not found"));
        
        // Act
        ResponseEntity<?> response = controller.getJobResult(jobId);
        
        // Assert
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        assertTrue(response.getBody().toString().contains("Error retrieving file"));
    }
    
    @Test
    void testGetJobStats() {
        // Arrange
        JobStats mockStats = JobStats.builder()
                .totalJobs(10)
                .activeJobs(3)
                .completedJobs(7)
                .build();
        
        when(taskManager.getJobStats()).thenReturn(mockStats);
        
        // Act
        ResponseEntity<JobStats> response = controller.getJobStats();
        
        // Assert
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(mockStats, response.getBody());
    }
    
    @Test
    void testCleanupOldJobs() {
        // Arrange
        when(taskManager.getJobStats())
            .thenReturn(JobStats.builder().totalJobs(10).build())
            .thenReturn(JobStats.builder().totalJobs(7).build());
        
        // Act
        ResponseEntity<?> response = controller.cleanupOldJobs();
        
        // Assert
        assertEquals(HttpStatus.OK, response.getStatusCode());
        
        @SuppressWarnings("unchecked")
        Map<String, Object> responseBody = (Map<String, Object>) response.getBody();
        assertEquals("Cleanup complete", responseBody.get("message"));
        assertEquals(3, responseBody.get("removedJobs"));
        assertEquals(7, responseBody.get("remainingJobs"));
        
        verify(taskManager).cleanupOldJobs();
    }
}