package stirling.software.common.annotations;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import io.quarkus.vertx.http.runtime.CurrentVertxRequest;
import io.vertx.core.http.HttpMethod;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.ext.web.RoutingContext;

import jakarta.interceptor.InvocationContext;
import jakarta.ws.rs.core.Response;

import stirling.software.common.aop.AutoJobAspect;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.JobExecutorService;

/**
 * MIGRATION (Spring AOP -> CDI interceptor): {@code AutoJobAspect} is now a CDI
 * {@code @AroundInvoke} interceptor. The advice method is {@code
 * wrapWithJobExecution(InvocationContext)} (was {@code (ProceedingJoinPoint, AutoJobPostMapping)});
 * the annotation/attributes are read reflectively from {@code ctx.getMethod()}, parameters from
 * {@code ctx.getParameters()}, and the call proceeds via {@code ctx.proceed()}. Request params
 * (e.g. {@code async}) come from the Vert.x request, not {@code HttpServletRequest}. The
 * collaborators ({@code JobExecutorService.runJobGeneric}) now return JAX-RS {@link Response}.
 * Tests are reworked to mock {@link InvocationContext} + the Vert.x request chain while preserving
 * the original verification intent (file resolution, async persistence, retries).
 */
@ExtendWith(MockitoExtension.class)
class AutoJobPostMappingIntegrationTest {

    private AutoJobAspect autoJobAspect;

    @Mock private JobExecutorService jobExecutorService;

    @Mock private CurrentVertxRequest currentVertxRequest;

    @Mock private RoutingContext routingContext;

    @Mock private HttpServerRequest httpServerRequest;

    @Mock private FileStorage fileStorage;

    @Mock private InvocationContext invocationContext;

    @Captor private ArgumentCaptor<Supplier<Object>> workCaptor;

    @Captor private ArgumentCaptor<Boolean> asyncCaptor;

    @Captor private ArgumentCaptor<Long> timeoutCaptor;

    @Captor private ArgumentCaptor<Boolean> queueableCaptor;

    @Captor private ArgumentCaptor<Integer> resourceWeightCaptor;

    @BeforeEach
    void setUp() {
        autoJobAspect = new AutoJobAspect(jobExecutorService, currentVertxRequest, fileStorage);

        // Wire the Vert.x request chain used for reading the "async" query param and for logging.
        lenient().when(currentVertxRequest.getCurrent()).thenReturn(routingContext);
        lenient().when(routingContext.request()).thenReturn(httpServerRequest);
        lenient().when(httpServerRequest.method()).thenReturn(HttpMethod.POST);
        lenient().when(httpServerRequest.path()).thenReturn("/api/v1/test");
        lenient().when(routingContext.get("jobId")).thenReturn(null);
    }

    // Real annotated methods so ctx.getMethod().getAnnotation(AutoJobPostMapping.class) returns the
    // attribute values each scenario needs (annotation attributes cannot be stubbed on a mock).

    @AutoJobPostMapping(
            timeout = 60000L,
            retryCount = 3,
            trackProgress = true,
            queueable = true,
            resourceWeight = 75)
    void customParametersTarget() {}

    @AutoJobPostMapping(timeout = -1L, retryCount = 2, trackProgress = false, queueable = false)
    void retryTarget() {}

    @AutoJobPostMapping(retryCount = 1)
    void asyncPersistTarget() {}

    private static Method method(String name) throws NoSuchMethodException {
        return AutoJobPostMappingIntegrationTest.class.getDeclaredMethod(name);
    }

    @Test
    void shouldExecuteWithCustomParameters() throws Throwable {
        // Given
        PDFFile pdfFile = new PDFFile();
        pdfFile.setFileId("test-file-id");
        Object[] args = {pdfFile};

        when(invocationContext.getMethod()).thenReturn(method("customParametersTarget"));
        when(invocationContext.getParameters()).thenReturn(args);
        when(httpServerRequest.getParam("async")).thenReturn("true");

        MultipartFile mockFile = mock(MultipartFile.class);
        when(fileStorage.retrieveFile("test-file-id")).thenReturn(mockFile);

        Response stubResponse = Response.ok("success").build();
        when(jobExecutorService.runJobGeneric(
                        anyBoolean(), any(Supplier.class), anyLong(), anyBoolean(), anyInt()))
                .thenReturn(stubResponse);

        // When
        Object result = autoJobAspect.wrapWithJobExecution(invocationContext);

        // Then
        assertSame(stubResponse, result);

        verify(jobExecutorService)
                .runJobGeneric(
                        asyncCaptor.capture(),
                        workCaptor.capture(),
                        timeoutCaptor.capture(),
                        queueableCaptor.capture(),
                        resourceWeightCaptor.capture());

        assertTrue(asyncCaptor.getValue(), "Async should be true");
        assertEquals(60000L, timeoutCaptor.getValue(), "Timeout should be 60000ms");
        assertTrue(queueableCaptor.getValue(), "Queueable should be true");
        assertEquals(75, resourceWeightCaptor.getValue(), "Resource weight should be 75");

        // Test that file was resolved
        assertNotNull(pdfFile.getFileInput(), "File input should be set");
    }

    @Test
    void shouldRetryOnError() throws Throwable {
        // Given
        when(invocationContext.getMethod()).thenReturn(method("retryTarget"));
        when(invocationContext.getParameters()).thenReturn(new Object[0]);
        when(httpServerRequest.getParam("async")).thenReturn("false");

        // First call throws exception, second succeeds
        Response retrySucceeded = Response.ok("retry succeeded").build();
        when(invocationContext.proceed())
                .thenThrow(new RuntimeException("First attempt failed"))
                .thenReturn(retrySucceeded);

        // Mock jobExecutorService to execute the work immediately
        when(jobExecutorService.runJobGeneric(
                        anyBoolean(), any(Supplier.class), anyLong(), anyBoolean(), anyInt()))
                .thenAnswer(
                        invocation -> {
                            Supplier<Object> work = invocation.getArgument(1);
                            return work.get();
                        });

        // When
        Object result = autoJobAspect.wrapWithJobExecution(invocationContext);

        // Then
        assertSame(retrySucceeded, result);

        // Verify that proceed was called twice (initial attempt + 1 retry)
        verify(invocationContext, times(2)).proceed();
    }

    @Test
    void shouldHandlePDFFileWithAsyncRequests() throws Throwable {
        // Given
        PDFFile pdfFile = new PDFFile();
        pdfFile.setFileInput(mock(MultipartFile.class));
        Object[] args = {pdfFile};

        when(invocationContext.getMethod()).thenReturn(method("asyncPersistTarget"));
        when(invocationContext.getParameters()).thenReturn(args);
        when(httpServerRequest.getParam("async")).thenReturn("true");

        when(fileStorage.storeFile(any(MultipartFile.class))).thenReturn("stored-file-id");
        when(fileStorage.retrieveFile("stored-file-id")).thenReturn(mock(MultipartFile.class));

        // Mock job executor to return a successful response
        when(jobExecutorService.runJobGeneric(
                        anyBoolean(), any(Supplier.class), anyLong(), anyBoolean(), anyInt()))
                .thenReturn(Response.ok("success").build());

        // When
        autoJobAspect.wrapWithJobExecution(invocationContext);

        // Then
        assertEquals(
                "stored-file-id",
                pdfFile.getFileId(),
                "FileId should be set to the stored file id");
        assertNotNull(pdfFile.getFileInput(), "FileInput should be replaced with persistent file");

        // Verify storage operations
        verify(fileStorage).storeFile(any(MultipartFile.class));
        verify(fileStorage).retrieveFile("stored-file-id");
    }
}
