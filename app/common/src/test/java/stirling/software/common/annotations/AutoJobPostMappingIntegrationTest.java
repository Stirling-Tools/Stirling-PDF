package stirling.software.common.annotations;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.function.Supplier;

import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.common.aop.AutoJobAspect;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.FileOrUploadService;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.JobExecutorService;

@ExtendWith(MockitoExtension.class)
@DisplayName("AutoJobPostMapping Integration Tests")
class AutoJobPostMappingIntegrationTest {

    private AutoJobAspect autoJobAspect;

    @Mock private JobExecutorService jobExecutorService;

    @Mock private HttpServletRequest request;

    @Mock private FileOrUploadService fileOrUploadService;

    @Mock private FileStorage fileStorage;

    @InjectMocks private AutoJobAspect aspectInjected; // Optional - for @InjectMocks based usage

    @Mock private ProceedingJoinPoint joinPoint;

    @Mock private stirling.software.common.annotations.AutoJobPostMapping autoJobPostMapping;

    @Captor private ArgumentCaptor<Supplier<Object>> workCaptor;

    @Captor private ArgumentCaptor<Boolean> asyncCaptor;

    @Captor private ArgumentCaptor<Long> timeoutCaptor;

    @Captor private ArgumentCaptor<Boolean> queueableCaptor;

    @Captor private ArgumentCaptor<Integer> resourceWeightCaptor;

    @BeforeEach
    void setUp() {
        // Setting up the AutoJobAspect with mocks (manual or use @InjectMocks)
        autoJobAspect =
                new AutoJobAspect(jobExecutorService, request, fileOrUploadService, fileStorage);
    }

    @Test
    @DisplayName("Should execute job with parameters from AutoJobPostMapping annotation")
    void shouldExecuteWithCustomParameters() throws Throwable {
        // Arrange: Create PDFFile argument with fileId set
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

        // Act
        Object result = autoJobAspect.wrapWithJobExecution(joinPoint, autoJobPostMapping);

        // Assert
        assertEquals(
                ResponseEntity.ok("success"),
                result,
                "Job execution should return success response");

        verify(jobExecutorService)
                .runJobGeneric(
                        asyncCaptor.capture(),
                        workCaptor.capture(),
                        timeoutCaptor.capture(),
                        queueableCaptor.capture(),
                        resourceWeightCaptor.capture());

        // Validate the captured arguments against expected values
        assertTrue(asyncCaptor.getValue(), "Async flag should be true");
        assertEquals(60000L, timeoutCaptor.getValue(), "Timeout value mismatch");
        assertTrue(queueableCaptor.getValue(), "Queueable flag should be true");
        assertEquals(75, resourceWeightCaptor.getValue(), "Resource weight mismatch");

        // Validate file input was resolved and set on PDFFile
        assertNotNull(pdfFile.getFileInput(), "PDFFile should have file input set");
    }

    @Test
    @DisplayName("Should retry job execution on failure up to configured retry count")
    void shouldRetryOnError() throws Throwable {
        // Arrange: No method arguments
        when(joinPoint.getArgs()).thenReturn(new Object[0]);
        when(request.getParameter("async")).thenReturn("false");

        when(autoJobPostMapping.timeout()).thenReturn(-1L);
        when(autoJobPostMapping.retryCount()).thenReturn(2);
        when(autoJobPostMapping.trackProgress()).thenReturn(false);
        when(autoJobPostMapping.queueable()).thenReturn(false);
        when(autoJobPostMapping.resourceWeight()).thenReturn(50);

        // Setup joinPoint.proceed() to throw on first call, succeed on second
        when(joinPoint.proceed(any()))
                .thenThrow(new RuntimeException("First attempt failed"))
                .thenReturn(ResponseEntity.ok("retry succeeded"));

        // We simulate runJobGeneric immediately invoking the Supplier work
        when(jobExecutorService.runJobGeneric(
                        anyBoolean(), any(Supplier.class), anyLong(), anyBoolean(), anyInt()))
                .thenAnswer(invocation -> invocation.getArgument(1, Supplier.class).get());

        // Act
        Object result = autoJobAspect.wrapWithJobExecution(joinPoint, autoJobPostMapping);

        // Assert
        assertEquals(
                ResponseEntity.ok("retry succeeded"), result, "Job should succeed after retry");

        // Verify joinPoint.proceed was called twice due to retry
        verify(joinPoint, times(2)).proceed(any());
    }

    @Test
    @DisplayName("Should process PDFFile argument and handle async request by storing file")
    void shouldHandlePDFFileWithAsyncRequests() throws Throwable {
        // Arrange: Create PDFFile argument with fileInput set
        PDFFile pdfFile = new PDFFile();
        MultipartFile mockMultipartFile = mock(MultipartFile.class);
        pdfFile.setFileInput(mockMultipartFile);

        Object[] args = new Object[] {pdfFile};
        when(joinPoint.getArgs()).thenReturn(args);
        when(request.getParameter("async")).thenReturn("true");
        when(autoJobPostMapping.retryCount()).thenReturn(1);

        when(fileStorage.storeFile(any(MultipartFile.class))).thenReturn("stored-file-id");
        when(fileStorage.retrieveFile("stored-file-id")).thenReturn(mockMultipartFile);

        when(jobExecutorService.runJobGeneric(
                        anyBoolean(), any(Supplier.class), anyLong(), anyBoolean(), anyInt()))
                .thenReturn(ResponseEntity.ok("success"));

        // Act
        autoJobAspect.wrapWithJobExecution(joinPoint, autoJobPostMapping);

        // Assert PDFFile state updated correctly
        assertEquals(
                "stored-file-id",
                pdfFile.getFileId(),
                "PDFFile should have updated fileId after storage");
        assertNotNull(pdfFile.getFileInput(), "PDFFile fileInput should be set to stored file");

        // Verify file storage methods were called
        verify(fileStorage).storeFile(any(MultipartFile.class));
        verify(fileStorage).retrieveFile("stored-file-id");
    }
}
