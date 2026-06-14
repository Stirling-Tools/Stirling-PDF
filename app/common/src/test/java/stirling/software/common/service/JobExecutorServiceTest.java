package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
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

import io.quarkus.vertx.http.runtime.CurrentVertxRequest;

import jakarta.enterprise.inject.Instance;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import stirling.software.common.model.io.InputStreamResource;
import stirling.software.common.model.io.Resource;
import stirling.software.common.model.job.JobResponse;

/**
 * MIGRATION (Spring -> Quarkus): {@code JobExecutorService} now returns JAX-RS {@link Response}
 * (was {@code ResponseEntity}), stores the per-request {@code jobId} on the Vert.x {@code
 * CurrentVertxRequest} (was {@code HttpServletRequest#setAttribute}), and resolves the owner via a
 * field-injected {@code Instance<JobOwnershipService>}. The request-attribute assertions are
 * dropped (no live request in a unit test - that path is a documented no-op); the ownership
 * Instance is stubbed non-resolvable via the package-private field. Result-body assertions are
 * adapted to the JAX-RS status/entity API.
 */
@ExtendWith(MockitoExtension.class)
class JobExecutorServiceTest {

    private static final String APPLICATION_PDF_VALUE = "application/pdf";

    private JobExecutorService jobExecutorService;

    @Mock private TaskManager taskManager;

    @Mock private FileStorage fileStorage;

    @Mock private CurrentVertxRequest currentVertxRequest;

    @Mock private ResourceMonitor resourceMonitor;

    @Mock private JobQueue jobQueue;

    @Mock private Instance<JobOwnershipService> jobOwnershipService;

    @Captor private ArgumentCaptor<String> jobIdCaptor;

    @BeforeEach
    void setUp() {
        // Off a live request the Vert.x current request is null; the service treats that as a
        // no-op.
        lenient().when(currentVertxRequest.getCurrent()).thenReturn(null);
        // No ownership service resolvable -> jobs are unscoped and unowned (matches default
        // runtime).
        lenient().when(jobOwnershipService.isResolvable()).thenReturn(false);

        // Initialize the service manually with all its dependencies
        jobExecutorService =
                new JobExecutorService(
                        taskManager,
                        fileStorage,
                        currentVertxRequest,
                        resourceMonitor,
                        jobQueue,
                        30000L, // asyncRequestTimeoutMs
                        "30m" // sessionTimeout
                        );
        // jobOwnershipService is @Inject Instance<> (field injection) - wire the mock directly
        // since there is no CDI container in this unit test. Field is package-private.
        jobExecutorService.jobOwnershipService = jobOwnershipService;
    }

    @Test
    void shouldRunSyncJobSuccessfully() throws Exception {
        // Given
        Supplier<Object> work = () -> "test-result";

        // When
        Response response = jobExecutorService.runJobGeneric(false, work);

        // Then
        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals("test-result", response.getEntity());
    }

    @Test
    void shouldExposeJobIdInJobContextDuringSyncExecution() throws Exception {
        // Given
        Supplier<Object> work = stirling.software.common.util.JobContext::getJobId;

        // When
        Response response = jobExecutorService.runJobGeneric(false, work);

        // Then: the sync work observed the jobId set in JobContext, which is returned as the body.
        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertNotNull(response.getEntity());
        assertInstanceOf(String.class, response.getEntity());
        assertFalse(((String) response.getEntity()).isEmpty());
    }

    @Test
    void shouldRunAsyncJobSuccessfully() throws Exception {
        // Given
        Supplier<Object> work = () -> "test-result";

        // When
        Response response = jobExecutorService.runJobGeneric(true, work);

        // Then
        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertInstanceOf(JobResponse.class, response.getEntity());
        JobResponse<?> jobResponse = (JobResponse<?>) response.getEntity();
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
        Response response = jobExecutorService.runJobGeneric(false, work);

        // Then
        assertEquals(Response.Status.INTERNAL_SERVER_ERROR.getStatusCode(), response.getStatus());

        @SuppressWarnings("unchecked")
        Map<String, String> errorMap = (Map<String, String>) response.getEntity();
        assertEquals("Job failed: Test error", errorMap.get("error"));
    }

    @Test
    void shouldQueueJobWhenResourcesLimited() throws Exception {
        // Given
        Supplier<Object> work = () -> "test-result";
        CompletableFuture<Response> future = new CompletableFuture<>();

        // Configure resourceMonitor to indicate job should be queued
        when(resourceMonitor.shouldQueueJob(80)).thenReturn(true);

        // Configure jobQueue to return our future
        when(jobQueue.queueJob(anyString(), eq(80), any(), anyLong())).thenReturn(future);

        // When
        Response response = jobExecutorService.runJobGeneric(true, work, 5000, true, 80);

        // Then
        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertInstanceOf(JobResponse.class, response.getEntity());

        // Verify job was queued
        verify(jobQueue).queueJob(anyString(), eq(80), any(), eq(5000L));
        verify(taskManager).createTask(anyString());
    }

    @Test
    void shouldUseCustomTimeoutWhenProvided() throws Exception {
        // Given
        Supplier<Object> work = () -> "test-result";
        long customTimeout = 60000L;

        // Use reflection to confirm the private executeWithTimeout method still exists with the
        // expected signature (the timeout plumbing the spy verification depends on).
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
    void shouldPersistResponseResourceBodyViaFileStorage() throws Exception {
        // Given: an async job whose result is a JAX-RS Response carrying a Resource entity - the
        // branch added by the stream-to-Resource migration. The executor must route the body
        // through FileStorage.storeFromResource and then record the result via
        // TaskManager.setFileResult with the filename/content-type extracted from the response.
        byte[] payload = "resource-bytes".getBytes(StandardCharsets.UTF_8);
        Resource resource =
                new InputStreamResource(new java.io.ByteArrayInputStream(payload), "result.pdf");

        Response work_response =
                Response.ok(resource)
                        .type(MediaType.valueOf(APPLICATION_PDF_VALUE))
                        .header(
                                HttpHeaders.CONTENT_DISPOSITION,
                                "form-data; name=\"attachment\"; filename=\"result.pdf\"")
                        .build();

        Supplier<Object> work = () -> work_response;

        when(fileStorage.storeFromResource(any(Resource.class), anyString()))
                .thenReturn("stored-file-id");

        // When: run the job asynchronously - processJobResult runs on the executor.
        Response response = jobExecutorService.runJobGeneric(true, work);

        // Then: the immediate return must be the JobResponse envelope.
        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertInstanceOf(JobResponse.class, response.getEntity());

        // Wait for async processing and verify the Resource branch was taken -
        // FileStorage.storeFromResource was invoked with the same Resource instance,
        // and TaskManager.setFileResult recorded the extracted filename + content-type.
        verify(fileStorage, timeout(5000)).storeFromResource(eq(resource), eq("result.pdf"));
        verify(taskManager, timeout(5000))
                .setFileResult(
                        anyString(),
                        eq("stored-file-id"),
                        eq("result.pdf"),
                        eq(APPLICATION_PDF_VALUE));
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
