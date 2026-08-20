package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.io.File;
import java.io.OutputStream;
import java.nio.file.Files;

import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.enterprise.inject.Instance;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import stirling.software.SPDF.service.PdfJsonConversionService;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class ConvertPdfJsonControllerTest {

    @Mock private PdfJsonConversionService pdfJsonConversionService;
    @Mock private TempFileManager tempFileManager;
    @Mock private Instance<JobOwnershipService> jobOwnershipService;

    @InjectMocks private ConvertPdfJsonController controller;

    @BeforeEach
    void setUp() throws Exception {
        // jobOwnershipService is an @Inject field (not a ctor arg), so @InjectMocks' constructor
        // strategy skips it - wire it manually. Not resolvable -> job-key scoping/access checks are
        // skipped (security disabled), matching single-node behaviour. Lenient: not every endpoint
        // reaches it.
        controller.jobOwnershipService = jobOwnershipService;
        lenient().when(jobOwnershipService.isResolvable()).thenReturn(false);
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    @Test
    void convertPdfToJson_nullFileInputThrows() {
        assertThrows(Exception.class, () -> controller.convertPdfToJson(null, false));
    }

    @Test
    void convertPdfToJson_success() throws Exception {
        byte[] jsonBytes = "{\"pages\":[]}".getBytes();
        FileUpload pdfFile = TestFileUploads.of("content".getBytes(), "doc.pdf", "application/pdf");

        // Service writes directly to the OutputStream passed by the controller
        doAnswer(
                        inv -> {
                            OutputStream os = inv.getArgument(2, OutputStream.class);
                            os.write(jsonBytes);
                            return null;
                        })
                .when(pdfJsonConversionService)
                .convertPdfToJson(any(MultipartFile.class), eq(false), any(OutputStream.class));

        Response response = controller.convertPdfToJson(pdfFile, false);

        assertEquals(200, response.getStatus());
        assertNotNull(response.getEntity());
    }

    @Test
    void convertPdfToJson_lightweightMode() throws Exception {
        byte[] jsonBytes = "{\"pages\":[]}".getBytes();
        FileUpload pdfFile = TestFileUploads.of("content".getBytes(), "doc.pdf", "application/pdf");

        doAnswer(
                        inv -> {
                            OutputStream os = inv.getArgument(2, OutputStream.class);
                            os.write(jsonBytes);
                            return null;
                        })
                .when(pdfJsonConversionService)
                .convertPdfToJson(any(MultipartFile.class), eq(true), any(OutputStream.class));

        Response response = controller.convertPdfToJson(pdfFile, true);

        assertEquals(200, response.getStatus());
        verify(pdfJsonConversionService)
                .convertPdfToJson(any(MultipartFile.class), eq(true), any(OutputStream.class));
    }

    @Test
    void convertJsonToPdf_nullFileInputThrows() {
        assertThrows(Exception.class, () -> controller.convertJsonToPdf(null));
    }

    @Test
    void convertJsonToPdf_success() throws Exception {
        byte[] pdfBytes = "pdf-content".getBytes();
        FileUpload jsonFile =
                TestFileUploads.of("{\"pages\":[]}".getBytes(), "doc.json", "application/json");

        doAnswer(
                        inv -> {
                            OutputStream os = inv.getArgument(1, OutputStream.class);
                            os.write(pdfBytes);
                            return null;
                        })
                .when(pdfJsonConversionService)
                .convertJsonToPdf(any(MultipartFile.class), any(OutputStream.class));

        Response response = controller.convertJsonToPdf(jsonFile);

        assertEquals(200, response.getStatus());
        assertNotNull(response.getEntity());
    }

    @Test
    void extractPdfMetadata_nullFileInputThrows() {
        assertThrows(Exception.class, () -> controller.extractPdfMetadata(null));
    }

    @Test
    void extractPdfMetadata_success() throws Exception {
        byte[] jsonBytes = "{\"metadata\":{}}".getBytes();
        FileUpload pdfFile = TestFileUploads.of("content".getBytes(), "doc.pdf", "application/pdf");

        doAnswer(
                        inv -> {
                            OutputStream os = inv.getArgument(2, OutputStream.class);
                            os.write(jsonBytes);
                            return null;
                        })
                .when(pdfJsonConversionService)
                .extractDocumentMetadata(
                        any(MultipartFile.class), any(String.class), any(OutputStream.class));

        Response response = controller.extractPdfMetadata(pdfFile);

        assertEquals(200, response.getStatus());
        assertEquals(MediaType.APPLICATION_JSON_TYPE, response.getMediaType());
        assertNotNull(response.getHeaderString("X-Job-Id"));
    }

    @Test
    void clearCache_success() {
        String jobId = "test-job-id";

        Response response = controller.clearCache(jobId);

        assertEquals(200, response.getStatus());
        verify(pdfJsonConversionService).clearCachedDocument(jobId);
    }

    @Test
    void extractSinglePage_success() throws Exception {
        byte[] jsonBytes = "{\"content\":[]}".getBytes();
        String jobId = "test-job-id";

        doAnswer(
                        inv -> {
                            OutputStream os = inv.getArgument(2, OutputStream.class);
                            os.write(jsonBytes);
                            return null;
                        })
                .when(pdfJsonConversionService)
                .extractSinglePage(eq(jobId), anyInt(), any(OutputStream.class));

        Response response = controller.extractSinglePage(jobId, 1);

        assertEquals(200, response.getStatus());
        assertNotNull(response.getEntity());
    }

    @Test
    void extractPageFonts_success() throws Exception {
        byte[] jsonBytes = "{\"fonts\":[]}".getBytes();
        String jobId = "test-job-id";

        doAnswer(
                        inv -> {
                            OutputStream os = inv.getArgument(2, OutputStream.class);
                            os.write(jsonBytes);
                            return null;
                        })
                .when(pdfJsonConversionService)
                .extractPageFonts(eq(jobId), anyInt(), any(OutputStream.class));

        Response response = controller.extractPageFonts(jobId, 1);

        assertEquals(200, response.getStatus());
        assertNotNull(response.getEntity());
    }
}
