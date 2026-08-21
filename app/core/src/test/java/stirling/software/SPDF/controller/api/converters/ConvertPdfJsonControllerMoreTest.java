package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.json.PdfJsonDocument;
import stirling.software.SPDF.model.json.PdfJsonMetadata;
import stirling.software.SPDF.service.PdfJsonConversionService;
import stirling.software.common.model.api.GeneralFile;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("ConvertPdfJsonController additional branch coverage")
class ConvertPdfJsonControllerMoreTest {

    @Mock private PdfJsonConversionService pdfJsonConversionService;
    @Mock private TempFileManager tempFileManager;
    @Mock private JobOwnershipService jobOwnershipService;

    @InjectMocks private ConvertPdfJsonController controller;

    private final java.util.List<TempFile> createdTempFiles = new java.util.ArrayList<>();

    @BeforeEach
    void setUp() throws Exception {
        // @InjectMocks uses the @RequiredArgsConstructor, so the @Autowired field is not
        // auto-injected; wire the JobOwnershipService mock in by reflection.
        setJobOwnershipService(jobOwnershipService);

        when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("more-test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            createdTempFiles.add(tf);
                            return tf;
                        });
    }

    private void setJobOwnershipService(JobOwnershipService service) throws Exception {
        Field f = ConvertPdfJsonController.class.getDeclaredField("jobOwnershipService");
        f.setAccessible(true);
        f.set(controller, service);
    }

    @AfterEach
    void tearDown() {
        for (TempFile tf : createdTempFiles) {
            try {
                if (tf.getFile() != null) {
                    tf.getFile().delete();
                }
            } catch (Exception ignored) {
                // best-effort cleanup
            }
        }
        createdTempFiles.clear();
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (java.io.InputStream in = response.getBody().getInputStream()) {
            in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    // Disable the @Autowired(required=false) JobOwnershipService for no-auth code paths.
    private void clearJobOwnershipService() throws Exception {
        setJobOwnershipService(null);
    }

    @Nested
    @DisplayName("convertPdfToJson filename handling")
    class ConvertPdfToJsonFilename {

        @Test
        @DisplayName("Null original filename falls back to document.json")
        void nullOriginalFilename() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile("fileInput", null, "application/pdf", "x".getBytes());
            PDFFile request = new PDFFile();
            request.setFileInput(pdfFile);

            doAnswer(writeBytes(2, "{}".getBytes()))
                    .when(pdfJsonConversionService)
                    .convertPdfToJson(eq(pdfFile), eq(false), any(OutputStream.class));

            ResponseEntity<Resource> response = controller.convertPdfToJson(request, false);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            String cd = response.getHeaders().getFirst("Content-Disposition");
            assertThat(cd).contains("document.json");
        }

        @Test
        @DisplayName("Blank original filename falls back to document.json")
        void blankOriginalFilename() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile("fileInput", "   ", "application/pdf", "x".getBytes());
            PDFFile request = new PDFFile();
            request.setFileInput(pdfFile);

            doAnswer(writeBytes(2, "{}".getBytes()))
                    .when(pdfJsonConversionService)
                    .convertPdfToJson(eq(pdfFile), eq(false), any(OutputStream.class));

            ResponseEntity<Resource> response = controller.convertPdfToJson(request, false);

            assertThat(response.getHeaders().getFirst("Content-Disposition"))
                    .contains("document.json");
        }

        @Test
        @DisplayName("Named file strips extension and appends .json")
        void namedFileStripsExtension() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput", "report.final.pdf", "application/pdf", "x".getBytes());
            PDFFile request = new PDFFile();
            request.setFileInput(pdfFile);

            doAnswer(writeBytes(2, "{}".getBytes()))
                    .when(pdfJsonConversionService)
                    .convertPdfToJson(eq(pdfFile), eq(false), any(OutputStream.class));

            ResponseEntity<Resource> response = controller.convertPdfToJson(request, false);

            assertThat(response.getHeaders().getFirst("Content-Disposition"))
                    .contains("report.final.json");
        }

        @Test
        @DisplayName("Service exception closes temp file and propagates")
        void serviceExceptionClosesTempFile() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput", "doc.pdf", "application/pdf", "x".getBytes());
            PDFFile request = new PDFFile();
            request.setFileInput(pdfFile);

            doThrow(new IllegalStateException("boom"))
                    .when(pdfJsonConversionService)
                    .convertPdfToJson(eq(pdfFile), eq(false), any(OutputStream.class));

            assertThrows(
                    IllegalStateException.class, () -> controller.convertPdfToJson(request, false));
            verify(createdTempFiles.get(0)).close();
        }
    }

    @Nested
    @DisplayName("convertJsonToPdf filename handling")
    class ConvertJsonToPdfFilename {

        @Test
        @DisplayName("Null original filename falls back to document.pdf")
        void nullOriginalFilename() throws Exception {
            MockMultipartFile jsonFile =
                    new MockMultipartFile("fileInput", null, "application/json", "{}".getBytes());
            GeneralFile request = new GeneralFile();
            request.setFileInput(jsonFile);

            doAnswer(writeBytes(1, "pdf".getBytes()))
                    .when(pdfJsonConversionService)
                    .convertJsonToPdf(eq(jsonFile), any(OutputStream.class));

            ResponseEntity<Resource> response = controller.convertJsonToPdf(request);

            assertThat(response.getHeaders().getFirst("Content-Disposition"))
                    .contains("document.pdf");
        }

        @Test
        @DisplayName("Filename already ending in .pdf is preserved")
        void filenameAlreadyPdf() throws Exception {
            // toSimpleFileName keeps base name; extension pattern strips the trailing .pdf,
            // so a base name that itself ends in .pdf exercises the endsWith branch.
            MockMultipartFile jsonFile =
                    new MockMultipartFile(
                            "fileInput", "weird.pdf.json", "application/json", "{}".getBytes());
            GeneralFile request = new GeneralFile();
            request.setFileInput(jsonFile);

            doAnswer(writeBytes(1, "pdf".getBytes()))
                    .when(pdfJsonConversionService)
                    .convertJsonToPdf(eq(jsonFile), any(OutputStream.class));

            ResponseEntity<Resource> response = controller.convertJsonToPdf(request);

            assertThat(response.getHeaders().getFirst("Content-Disposition")).contains("weird.pdf");
        }

        @Test
        @DisplayName("Service exception closes temp file and propagates")
        void serviceExceptionClosesTempFile() throws Exception {
            MockMultipartFile jsonFile =
                    new MockMultipartFile(
                            "fileInput", "doc.json", "application/json", "{}".getBytes());
            GeneralFile request = new GeneralFile();
            request.setFileInput(jsonFile);

            doThrow(new IllegalStateException("boom"))
                    .when(pdfJsonConversionService)
                    .convertJsonToPdf(eq(jsonFile), any(OutputStream.class));

            assertThrows(IllegalStateException.class, () -> controller.convertJsonToPdf(request));
            verify(createdTempFiles.get(0)).close();
        }
    }

    @Nested
    @DisplayName("extractPdfMetadata job-key scoping")
    class ExtractMetadataScoping {

        @Test
        @DisplayName("Uses scoped job key when JobOwnershipService present")
        void usesScopedKey() throws Exception {
            when(jobOwnershipService.createScopedJobKey(anyString())).thenReturn("user:scoped-id");
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput", "doc.pdf", "application/pdf", "x".getBytes());
            PDFFile request = new PDFFile();
            request.setFileInput(pdfFile);

            doAnswer(writeBytes(2, "{}".getBytes()))
                    .when(pdfJsonConversionService)
                    .extractDocumentMetadata(
                            eq(pdfFile), eq("user:scoped-id"), any(OutputStream.class));

            ResponseEntity<Resource> response = controller.extractPdfMetadata(request);

            assertEquals("user:scoped-id", response.getHeaders().getFirst("X-Job-Id"));
            verify(jobOwnershipService).createScopedJobKey(anyString());
        }

        @Test
        @DisplayName("Uses raw job key when no JobOwnershipService")
        void usesRawKeyWhenNoService() throws Exception {
            clearJobOwnershipService();
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput", "doc.pdf", "application/pdf", "x".getBytes());
            PDFFile request = new PDFFile();
            request.setFileInput(pdfFile);

            doAnswer(writeBytes(2, "{}".getBytes()))
                    .when(pdfJsonConversionService)
                    .extractDocumentMetadata(eq(pdfFile), anyString(), any(OutputStream.class));

            ResponseEntity<Resource> response = controller.extractPdfMetadata(request);

            assertNotNull(response.getHeaders().getFirst("X-Job-Id"));
        }

        @Test
        @DisplayName("Service exception closes temp file and propagates")
        void serviceExceptionClosesTempFile() throws Exception {
            when(jobOwnershipService.createScopedJobKey(anyString())).thenReturn("k");
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput", "doc.pdf", "application/pdf", "x".getBytes());
            PDFFile request = new PDFFile();
            request.setFileInput(pdfFile);

            doThrow(new IllegalStateException("boom"))
                    .when(pdfJsonConversionService)
                    .extractDocumentMetadata(eq(pdfFile), anyString(), any(OutputStream.class));

            assertThrows(IllegalStateException.class, () -> controller.extractPdfMetadata(request));
            verify(createdTempFiles.get(0)).close();
        }
    }

    @Nested
    @DisplayName("exportPartialPdf")
    class ExportPartialPdf {

        @Test
        @DisplayName("Null document throws")
        void nullDocumentThrows() {
            assertThrows(
                    Exception.class, () -> controller.exportPartialPdf("job", null, "out.pdf"));
        }

        @Test
        @DisplayName("Explicit filename param wins over metadata title")
        void filenameParamWins() throws Exception {
            when(jobOwnershipService.validateJobAccess(anyString())).thenReturn(true);
            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setMetadata(PdfJsonMetadata.builder().title("titleName").build());

            doAnswer(writeBytes(2, "pdf".getBytes()))
                    .when(pdfJsonConversionService)
                    .exportUpdatedPages(eq("job"), eq(doc), any(OutputStream.class));

            ResponseEntity<Resource> response =
                    controller.exportPartialPdf("job", doc, "custom.pdf");

            assertThat(response.getHeaders().getFirst("Content-Disposition"))
                    .contains("custom.pdf");
        }

        @Test
        @DisplayName("Falls back to metadata title when filename blank")
        void fallbackToMetadataTitle() throws Exception {
            when(jobOwnershipService.validateJobAccess(anyString())).thenReturn(true);
            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setMetadata(PdfJsonMetadata.builder().title("MyTitle").build());

            doAnswer(writeBytes(2, "pdf".getBytes()))
                    .when(pdfJsonConversionService)
                    .exportUpdatedPages(eq("job"), eq(doc), any(OutputStream.class));

            ResponseEntity<Resource> response = controller.exportPartialPdf("job", doc, "   ");

            assertThat(response.getHeaders().getFirst("Content-Disposition"))
                    .contains("MyTitle.pdf");
        }

        @Test
        @DisplayName("Falls back to document when title null/blank and no filename")
        void fallbackToDocumentName() throws Exception {
            when(jobOwnershipService.validateJobAccess(anyString())).thenReturn(true);
            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setMetadata(PdfJsonMetadata.builder().title("   ").build());

            doAnswer(writeBytes(2, "pdf".getBytes()))
                    .when(pdfJsonConversionService)
                    .exportUpdatedPages(eq("job"), eq(doc), any(OutputStream.class));

            ResponseEntity<Resource> response = controller.exportPartialPdf("job", doc, null);

            assertThat(response.getHeaders().getFirst("Content-Disposition"))
                    .contains("document.pdf");
        }

        @Test
        @DisplayName("Null metadata falls back to document name")
        void nullMetadataFallback() throws Exception {
            when(jobOwnershipService.validateJobAccess(anyString())).thenReturn(true);
            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setMetadata(null);

            doAnswer(writeBytes(2, "pdf".getBytes()))
                    .when(pdfJsonConversionService)
                    .exportUpdatedPages(eq("job"), eq(doc), any(OutputStream.class));

            ResponseEntity<Resource> response = controller.exportPartialPdf("job", doc, null);

            assertThat(response.getHeaders().getFirst("Content-Disposition"))
                    .contains("document.pdf");
        }

        @Test
        @DisplayName("Service exception closes temp file and propagates")
        void serviceExceptionClosesTempFile() throws Exception {
            when(jobOwnershipService.validateJobAccess(anyString())).thenReturn(true);
            PdfJsonDocument doc = new PdfJsonDocument();

            doThrow(new IllegalStateException("boom"))
                    .when(pdfJsonConversionService)
                    .exportUpdatedPages(
                            anyString(), any(PdfJsonDocument.class), any(OutputStream.class));

            assertThrows(
                    IllegalStateException.class,
                    () -> controller.exportPartialPdf("job", doc, "out.pdf"));
            verify(createdTempFiles.get(0)).close();
        }
    }

    @Nested
    @DisplayName("extractSinglePage and extractPageFonts errors")
    class GetPageErrors {

        @Test
        @DisplayName("extractSinglePage service exception closes temp file")
        void singlePageException() throws Exception {
            when(jobOwnershipService.validateJobAccess(anyString())).thenReturn(true);
            doThrow(new IllegalStateException("boom"))
                    .when(pdfJsonConversionService)
                    .extractSinglePage(anyString(), anyInt(), any(OutputStream.class));

            assertThrows(IllegalStateException.class, () -> controller.extractSinglePage("job", 1));
            verify(createdTempFiles.get(0)).close();
        }

        @Test
        @DisplayName("extractPageFonts service exception closes temp file")
        void pageFontsException() throws Exception {
            when(jobOwnershipService.validateJobAccess(anyString())).thenReturn(true);
            doThrow(new IllegalStateException("boom"))
                    .when(pdfJsonConversionService)
                    .extractPageFonts(anyString(), anyInt(), any(OutputStream.class));

            assertThrows(IllegalStateException.class, () -> controller.extractPageFonts("job", 1));
            verify(createdTempFiles.get(0)).close();
        }

        @Test
        @DisplayName("Page docName carries page number")
        void singlePageDocName() throws Exception {
            when(jobOwnershipService.validateJobAccess(anyString())).thenReturn(true);
            doAnswer(writeBytes(2, "{}".getBytes()))
                    .when(pdfJsonConversionService)
                    .extractSinglePage(eq("job"), eq(7), any(OutputStream.class));

            ResponseEntity<Resource> response = controller.extractSinglePage("job", 7);

            assertThat(response.getHeaders().getFirst("Content-Disposition"))
                    .contains("page_7.json");
        }
    }

    @Nested
    @DisplayName("validateJobAccess and clearCache delegation")
    class JobAccessDelegation {

        @Test
        @DisplayName("clearCache validates and delegates when service present")
        void clearCacheWithService() {
            when(jobOwnershipService.validateJobAccess(anyString())).thenReturn(true);

            ResponseEntity<Void> response = controller.clearCache("job-1");

            assertEquals(HttpStatus.OK, response.getStatusCode());
            verify(jobOwnershipService).validateJobAccess("job-1");
            verify(pdfJsonConversionService).clearCachedDocument("job-1");
        }

        @Test
        @DisplayName("clearCache skips validation when no service")
        void clearCacheNoService() throws Exception {
            clearJobOwnershipService();

            ResponseEntity<Void> response = controller.clearCache("job-2");

            assertEquals(HttpStatus.OK, response.getStatusCode());
            verify(pdfJsonConversionService).clearCachedDocument("job-2");
            verify(jobOwnershipService, never()).validateJobAccess(anyString());
        }

        @Test
        @DisplayName("validateJobAccess propagates SecurityException from service")
        void validateThrows() {
            doThrow(new SecurityException("denied"))
                    .when(jobOwnershipService)
                    .validateJobAccess("bad");

            assertThrows(SecurityException.class, () -> controller.clearCache("bad"));
            verify(pdfJsonConversionService, never()).clearCachedDocument(anyString());
        }
    }

    @Nested
    @DisplayName("logJsonResponse diagnostic paths")
    class LogJsonResponseDiagnostics {

        @Test
        @DisplayName("Debug dump writes a copy to configured dir")
        void debugDumpWritesCopy(@org.junit.jupiter.api.io.TempDir Path dumpDir) throws Exception {
            String previous = System.getProperty("spdf.pdfjson.dump");
            System.setProperty("spdf.pdfjson.dump", "true");
            String prevDir = System.getProperty("java.io.tmpdir");
            // SPDF_PDFJSON_DUMP_DIR env may be unset; controller falls back to java.io.tmpdir.
            System.setProperty("java.io.tmpdir", dumpDir.toString());
            try {
                MockMultipartFile pdfFile =
                        new MockMultipartFile(
                                "fileInput", "doc.pdf", "application/pdf", "x".getBytes());
                PDFFile request = new PDFFile();
                request.setFileInput(pdfFile);

                doAnswer(writeBytes(2, "{\"k\":\"value-string-here\"}".getBytes()))
                        .when(pdfJsonConversionService)
                        .convertPdfToJson(eq(pdfFile), eq(false), any(OutputStream.class));

                ResponseEntity<Resource> response = controller.convertPdfToJson(request, false);
                assertEquals(HttpStatus.OK, response.getStatusCode());

                try (var stream = Files.list(dumpDir)) {
                    boolean dumped =
                            stream.anyMatch(p -> p.getFileName().toString().startsWith("pdfjson_"));
                    assertThat(dumped).isTrue();
                }
            } finally {
                restoreProp("spdf.pdfjson.dump", previous);
                restoreProp("java.io.tmpdir", prevDir);
            }
        }

        @Test
        @DisplayName("Repeat scan runs without error on repeated strings")
        void repeatScanRuns() throws Exception {
            String previous = System.getProperty("spdf.pdfjson.repeatScan");
            System.setProperty("spdf.pdfjson.repeatScan", "true");
            try {
                MockMultipartFile pdfFile =
                        new MockMultipartFile(
                                "fileInput", "doc.pdf", "application/pdf", "x".getBytes());
                PDFFile request = new PDFFile();
                request.setFileInput(pdfFile);

                // Two repeated >=12 char strings plus a long base64-like one to exercise filters.
                String json =
                        "{\"a\":\"repeated-string-value\",\"b\":\"repeated-string-value\","
                                + "\"c\":\"QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU2Nzg5\"}";
                doAnswer(writeBytes(2, json.getBytes()))
                        .when(pdfJsonConversionService)
                        .convertPdfToJson(eq(pdfFile), eq(false), any(OutputStream.class));

                ResponseEntity<Resource> response = controller.convertPdfToJson(request, false);
                assertEquals(HttpStatus.OK, response.getStatusCode());
                assertThat(drainBody(response)).isNotEmpty();
            } finally {
                restoreProp("spdf.pdfjson.repeatScan", previous);
            }
        }

        @Test
        @DisplayName("Repeat scan handles no repeated strings")
        void repeatScanNoRepeats() throws Exception {
            String previous = System.getProperty("spdf.pdfjson.repeatScan");
            System.setProperty("spdf.pdfjson.repeatScan", "true");
            try {
                MockMultipartFile pdfFile =
                        new MockMultipartFile(
                                "fileInput", "doc.pdf", "application/pdf", "x".getBytes());
                PDFFile request = new PDFFile();
                request.setFileInput(pdfFile);

                String json = "{\"only-key-here-unique\":\"only-value-here-unique\"}";
                doAnswer(writeBytes(2, json.getBytes()))
                        .when(pdfJsonConversionService)
                        .convertPdfToJson(eq(pdfFile), eq(false), any(OutputStream.class));

                ResponseEntity<Resource> response = controller.convertPdfToJson(request, false);
                assertEquals(HttpStatus.OK, response.getStatusCode());
            } finally {
                restoreProp("spdf.pdfjson.repeatScan", previous);
            }
        }
    }

    private static org.mockito.stubbing.Answer<Object> writeBytes(int argIndex, byte[] data) {
        return inv -> {
            OutputStream os = inv.getArgument(argIndex, OutputStream.class);
            os.write(data);
            return null;
        };
    }

    private static void restoreProp(String key, String previous) {
        if (previous == null) {
            System.clearProperty(key);
        } else {
            System.setProperty(key, previous);
        }
    }
}
