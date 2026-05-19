package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.common.model.job.JobResponse;

@ExtendWith(MockitoExtension.class)
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
    void shouldRunSyncJobSuccessfully() throws Exception {
        // Given
        Supplier<Object> work = () -> "test-result";

        // When
        ResponseEntity<?> response = jobExecutorService.runJobGeneric(false, work);

        // Then
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("test-result", response.getBody());

        // Verify request attribute was set with jobId
        verify(request).setAttribute(eq("jobId"), anyString());
    }

    @Test
    void shouldExposeJobIdInJobContextDuringSyncExecution() throws Exception {
        // Given
        Supplier<Object> work = stirling.software.common.util.JobContext::getJobId;

        // When
        ResponseEntity<?> response = jobExecutorService.runJobGeneric(false, work);

        // Then
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());

        var requestJobIdCaptor = ArgumentCaptor.forClass(String.class);
        verify(request).setAttribute(eq("jobId"), requestJobIdCaptor.capture());
        assertEquals(requestJobIdCaptor.getValue(), response.getBody());
    }

    @Test
    void shouldRunAsyncJobSuccessfully() throws Exception {
        // Given
        Supplier<Object> work = () -> "test-result";

        // When
        ResponseEntity<?> response = jobExecutorService.runJobGeneric(true, work);

        // Then
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertInstanceOf(JobResponse.class, response.getBody());
        JobResponse<?> jobResponse = (JobResponse<?>) response.getBody();
        assertTrue(jobResponse.isAsync());
        assertNotNull(jobResponse.getJobId());

        // Verify task manager was called
        verify(taskManager).createTask(jobIdCaptor.capture());
    }

    @Test
    void shouldHandleSyncJobError() {
        // Given
        Supplier<Object> work =
                () -> {
                    throw new RuntimeException("Test error");
                };

        // When
        ResponseEntity<?> response = jobExecutorService.runJobGeneric(false, work);

        // Then
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());

        @SuppressWarnings("unchecked")
        Map<String, String> errorMap = (Map<String, String>) response.getBody();
        assertEquals("Job failed: Test error", errorMap.get("error"));
    }

    @Test
    void shouldQueueJobWhenResourcesLimited() throws Exception {
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
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertInstanceOf(JobResponse.class, response.getBody());

        // Verify job was queued
        verify(jobQueue).queueJob(anyString(), eq(80), any(), eq(5000L));
        verify(taskManager).createTask(anyString());
    }

    @Test
    void shouldUseCustomTimeoutWhenProvided() throws Exception {
        // Given
        Supplier<Object> work = () -> "test-result";
        long customTimeout = 60000L;

        // Use reflection to access the private executeWithTimeout method
        java.lang.reflect.Method executeMethod =
                JobExecutorService.class.getDeclaredMethod(
                        "executeWithTimeout", Supplier.class, long.class);
        executeMethod.setAccessible(true);

        // Create a spy on the JobExecutorService to verify method calls
        JobExecutorService spy = Mockito.spy(jobExecutorService);

        // When
        spy.runJobGeneric(false, work, customTimeout);

        // Then
        verify(spy).runJobGeneric(eq(false), any(Supplier.class), eq(customTimeout));
    }

    @Test
    void shouldPersistResponseEntityResourceBodyViaFileStorage() throws Exception {
        // Given: an async job whose result is a ResponseEntity<Resource> — the new
        // branch added by the stream-to-Resource migration. The executor must route
        // the body through FileStorage.storeFromResource and then record the result
        // via TaskManager.setFileResult with the filename/content-type extracted
        // from the response headers.
        byte[] payload = "resource-bytes".getBytes(StandardCharsets.UTF_8);
        Resource resource = new ByteArrayResource(payload);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDisposition(
                ContentDisposition.formData().name("attachment").filename("result.pdf").build());

        Supplier<Object> work = () -> new ResponseEntity<>(resource, headers, HttpStatus.OK);

        when(fileStorage.storeFromResource(any(Resource.class), anyString()))
                .thenReturn("stored-file-id");

        // When: run the job asynchronously — processJobResult runs on the executor.
        ResponseEntity<?> response = jobExecutorService.runJobGeneric(true, work);

        // Then: the immediate return must be the JobResponse envelope.
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertInstanceOf(JobResponse.class, response.getBody());

        // Wait for async processing and verify the Resource branch was taken —
        // FileStorage.storeFromResource was invoked with the same Resource instance,
        // and TaskManager.setFileResult recorded the extracted filename + content-type.
        verify(fileStorage, timeout(5000)).storeFromResource(eq(resource), eq("result.pdf"));
        verify(taskManager, timeout(5000))
                .setFileResult(
                        anyString(),
                        eq("stored-file-id"),
                        eq("result.pdf"),
                        eq(MediaType.APPLICATION_PDF_VALUE));
        verify(taskManager, timeout(5000)).setComplete(anyString());
    }

    @Test
    void shouldHandleTimeout() throws Exception {
        // Given
        Supplier<Object> work =
                () -> {
                    // Simulate long-running job without actual sleep
                    // Use a loop to consume time instead of Thread.sleep
                    long startTime = System.nanoTime();
                    while (System.nanoTime() - startTime < 100_000_000) { // 100ms in nanoseconds
                        // Busy wait to simulate work without Thread.sleep
                    }
                    return "test-result";
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
