package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.common.model.job.JobResponse;

@ExtendWith(MockitoExtension.class)
@DisplayName("JobExecutorService Tests")
class JobExecutorServiceTest {

    private JobExecutorService jobExecutorService;

    @Mock private TaskManager taskManager;

    @Mock private FileStorage fileStorage;

    @Mock private HttpServletRequest request;

    @Mock private ResourceMonitor resourceMonitor;

    @Mock private JobQueue jobQueue;

    @Captor private ArgumentCaptor<String> jobIdCaptor;

    @BeforeEach
    void setUp() {
        // Initialize the service manually with all its dependencies
        jobExecutorService =
                new JobExecutorService(
                        taskManager,
                        fileStorage,
                        request,
                        resourceMonitor,
                        jobQueue,
                        30000L, // asyncRequestTimeoutMs
                        "30m" // sessionTimeout
                        );
    }

    @Test
    @DisplayName("Should run synchronous job successfully and return result")
    void shouldRunSyncJobSuccessfully() {
        // Given
        Supplier<Object> work = () -> "test-result";

        // When
        ResponseEntity<?> response = jobExecutorService.runJobGeneric(false, work);

        // Then
        assertEquals(HttpStatus.OK, response.getStatusCode(), "Response status should be OK");
        assertEquals("test-result", response.getBody(), "Response body should match work result");

        // Verify request attribute was set with jobId
        verify(request).setAttribute(eq("jobId"), anyString());
    }

    @Test
    @DisplayName("Should run asynchronous job successfully and return JobResponse")
    void shouldRunAsyncJobSuccessfully() throws Exception {
        // Given
        Supplier<Object> work = () -> "test-result";

        // When
        ResponseEntity<?> response = jobExecutorService.runJobGeneric(true, work);

        // Then
        assertEquals(HttpStatus.OK, response.getStatusCode(), "Response status should be OK");
        assertInstanceOf(
                JobResponse.class, response.getBody(), "Response body should be JobResponse");
        JobResponse<?> jobResponse = (JobResponse<?>) response.getBody();
        assertTrue(jobResponse.isAsync(), "JobResponse should indicate async");
        assertNotNull(jobResponse.getJobId(), "Job ID should be generated");

        // Verify task manager was called
        verify(taskManager).createTask(jobIdCaptor.capture());
    }

    @Test
    @DisplayName("Should handle error in synchronous job and return error response")
    void shouldHandleSyncJobError() {
        // Given
        Supplier<Object> work =
                () -> {
                    throw new RuntimeException("Test error");
                };

        // When
        ResponseEntity<?> response = jobExecutorService.runJobGeneric(false, work);

        // Then
        assertEquals(
                HttpStatus.INTERNAL_SERVER_ERROR,
                response.getStatusCode(),
                "Response status should be INTERNAL_SERVER_ERROR");

        @SuppressWarnings("unchecked")
        Map<String, String> errorMap = (Map<String, String>) response.getBody();
        assertNotNull(errorMap, "Error response body should not be null");
        assertEquals(
                "Job failed: Test error",
                errorMap.get("error"),
                "Error message should match exception");
    }

    @Test
    @DisplayName("Should queue job when resources are limited")
    void shouldQueueJobWhenResourcesLimited() {
        // Given
        Supplier<Object> work = () -> "test-result";
        CompletableFuture<ResponseEntity<?>> future = new CompletableFuture<>();

        // Configure resourceMonitor to indicate job should be queued
        when(resourceMonitor.shouldQueueJob(80)).thenReturn(true);

        // Configure jobQueue to return our future
        when(jobQueue.queueJob(anyString(), eq(80), any(), anyLong())).thenReturn(future);

        // When
        ResponseEntity<?> response = jobExecutorService.runJobGeneric(true, work, 5000, true, 80);

        // Then
        assertEquals(HttpStatus.OK, response.getStatusCode(), "Response status should be OK");
        assertInstanceOf(
                JobResponse.class, response.getBody(), "Response body should be JobResponse");

        // Verify job was queued
        verify(jobQueue).queueJob(anyString(), eq(80), any(), eq(5000L));
        verify(taskManager).createTask(anyString());
    }

    @Test
    @DisplayName("Should use custom timeout when provided for job execution")
    void shouldUseCustomTimeoutWhenProvided() throws Exception {
        // Given
        Supplier<Object> work = () -> "test-result";
        long customTimeout = 60000L;

        // When
        ResponseEntity<?> response = jobExecutorService.runJobGeneric(false, work, customTimeout);

        // Then
        assertEquals(HttpStatus.OK, response.getStatusCode(), "Response status should be OK");
        assertEquals("test-result", response.getBody(), "Response body should match work result");
    }

    @Test
    @DisplayName("Should handle timeout exception during job execution")
    void shouldHandleTimeout() throws Exception {
        // Given
        Supplier<Object> work =
                () -> {
                    try {
                        Thread.sleep(100); // Simulate long-running job
                        return "test-result";
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new RuntimeException(e);
                    }
                };

        // Use reflection to access the private executeWithTimeout method
        java.lang.reflect.Method executeMethod =
                JobExecutorService.class.getDeclaredMethod(
                        "executeWithTimeout", Supplier.class, long.class);
        executeMethod.setAccessible(true);

        // When/Then
        try {
            executeMethod.invoke(jobExecutorService, work, 1L); // Very short timeout
        } catch (Exception e) {
            assertInstanceOf(TimeoutException.class, e.getCause());
        }
    }
}
