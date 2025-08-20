package stirling.software.common.annotations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.function.Supplier;

import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.common.aop.AutoJobAspect;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.JobExecutorService;
import stirling.software.common.service.JobQueue;
import stirling.software.common.service.ResourceMonitor;

@ExtendWith(MockitoExtension.class)
class AutoJobPostMappingIntegrationTest {

    private AutoJobAspect autoJobAspect;

    @Mock private JobExecutorService jobExecutorService;

    @Mock private HttpServletRequest request;

    @Mock private FileStorage fileStorage;

    @Mock private ResourceMonitor resourceMonitor;

    @Mock private JobQueue jobQueue;

    @BeforeEach
    void setUp() {
        autoJobAspect = new AutoJobAspect(jobExecutorService, request, fileStorage);
    }

    @Mock private ProceedingJoinPoint joinPoint;

    @Mock private AutoJobPostMapping autoJobPostMapping;

    @Captor private ArgumentCaptor<Supplier<Object>> workCaptor;

    @Captor private ArgumentCaptor<Boolean> asyncCaptor;

    @Captor private ArgumentCaptor<Long> timeoutCaptor;

    @Captor private ArgumentCaptor<Boolean> queueableCaptor;

    @Captor private ArgumentCaptor<Integer> resourceWeightCaptor;

    @Test
    void shouldExecuteWithCustomParameters() throws Throwable {
        // Given
        PDFFile pdfFile = new PDFFile();
        pdfFile.setFileId("test-file-id");
        Object[] args = new Object[] {pdfFile};

        when(joinPoint.getArgs()).thenReturn(args);
        when(request.getParameter("async")).thenReturn("true");
        when(autoJobPostMapping.timeout()).thenReturn(60000L);
        when(autoJobPostMapping.retryCount()).thenReturn(3);
        when(autoJobPostMapping.trackProgress()).thenReturn(true);
        when(autoJobPostMapping.queueable()).thenReturn(true);
        when(autoJobPostMapping.resourceWeight()).thenReturn(75);

        MultipartFile mockFile = mock(MultipartFile.class);
        when(fileStorage.retrieveFile("test-file-id")).thenReturn(mockFile);

        when(jobExecutorService.runJobGeneric(
                        anyBoolean(), any(Supplier.class), anyLong(), anyBoolean(), anyInt()))
                .thenReturn(ResponseEntity.ok("success"));

        // When
        Object result = autoJobAspect.wrapWithJobExecution(joinPoint, autoJobPostMapping);

        // Then
        assertEquals(ResponseEntity.ok("success"), result);

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
        when(joinPoint.getArgs()).thenReturn(new Object[0]);
        when(request.getParameter("async")).thenReturn("false");
        when(autoJobPostMapping.timeout()).thenReturn(-1L);
        when(autoJobPostMapping.retryCount()).thenReturn(2);
        when(autoJobPostMapping.trackProgress()).thenReturn(false);
        when(autoJobPostMapping.queueable()).thenReturn(false);
        when(autoJobPostMapping.resourceWeight()).thenReturn(50);

        // First call throws exception, second succeeds
        when(joinPoint.proceed(any()))
                .thenThrow(new RuntimeException("First attempt failed"))
                .thenReturn(ResponseEntity.ok("retry succeeded"));

        // Mock jobExecutorService to execute the work immediately
        when(jobExecutorService.runJobGeneric(
                        anyBoolean(), any(Supplier.class), anyLong(), anyBoolean(), anyInt()))
                .thenAnswer(
                        invocation -> {
                            Supplier<Object> work = invocation.getArgument(1);
                            return work.get();
                        });

        // When
        Object result = autoJobAspect.wrapWithJobExecution(joinPoint, autoJobPostMapping);

        // Then
        assertEquals(ResponseEntity.ok("retry succeeded"), result);

        // Verify that proceed was called twice (initial attempt + 1 retry)
        verify(joinPoint, times(2)).proceed(any());
    }

    @Test
    void shouldHandlePDFFileWithAsyncRequests() throws Throwable {
        // Given
        PDFFile pdfFile = new PDFFile();
        pdfFile.setFileInput(mock(MultipartFile.class));
        Object[] args = new Object[] {pdfFile};

        when(joinPoint.getArgs()).thenReturn(args);
        when(request.getParameter("async")).thenReturn("true");
        when(autoJobPostMapping.retryCount()).thenReturn(1);

        when(fileStorage.storeFile(any(MultipartFile.class))).thenReturn("stored-file-id");
        when(fileStorage.retrieveFile("stored-file-id")).thenReturn(mock(MultipartFile.class));

        // Mock job executor to return a successful response
        when(jobExecutorService.runJobGeneric(
                        anyBoolean(), any(Supplier.class), anyLong(), anyBoolean(), anyInt()))
                .thenReturn(ResponseEntity.ok("success"));

        // When
        autoJobAspect.wrapWithJobExecution(joinPoint, autoJobPostMapping);

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
