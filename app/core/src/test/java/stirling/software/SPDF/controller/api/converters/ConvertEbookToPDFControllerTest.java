package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.converters.ConvertEbookToPdfRequest;
import stirling.software.SPDF.service.OfficeToPdfService;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.OfficeDocumentSanitizer;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.officeconvert.topdf.OfficeToPdf;

@ExtendWith(MockitoExtension.class)
class ConvertEbookToPDFControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private OfficeDocumentSanitizer officeDocumentSanitizer;
    @Mock private OfficeToPdfService officeToPdfService;

    @InjectMocks private ConvertEbookToPDFController controller;

    private Path workingDir;

    @BeforeEach
    void setUp() throws Exception {
        workingDir = Files.createTempDirectory("ebook-convert-test-");
        lenient().when(tempFileManager.createTempDirectory()).thenReturn(workingDir);
        lenient().when(officeToPdfService.options()).thenReturn(OfficeToPdf.Options.defaults());
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

    @AfterEach
    void tearDown() throws IOException {
        deleteRecursively(workingDir);
    }

    private void converterWritesPdf() throws IOException {
        Mockito.doAnswer(
                        inv -> {
                            Files.writeString(inv.getArgument(1), "pdf");
                            return null;
                        })
                .when(officeToPdfService)
                .convert(any(Path.class), any(Path.class), any(OfficeToPdf.Options.class));
    }

    private static ConvertEbookToPdfRequest request(String name, byte[] content) {
        ConvertEbookToPdfRequest request = new ConvertEbookToPdfRequest();
        request.setFileInput(
                new MockMultipartFile("fileInput", name, "application/octet-stream", content));
        return request;
    }

    @Test
    void convertEbookToPdf_passesOptionsAndCleansUp() throws Exception {
        ConvertEbookToPdfRequest request = request("ebook.epub", "content".getBytes());
        request.setIncludeTableOfContents(true);
        request.setIncludePageNumbers(true);
        converterWritesPdf();
        when(pdfDocumentFactory.load(any(File.class))).thenReturn(mock(PDDocument.class));

        try (MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class);
                MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
            ResponseEntity<Resource> expected =
                    ResponseEntity.ok(new ByteArrayResource(new byte[0]));
            wr.when(() -> WebResponseUtils.pdfFileToWebResponse(any(TempFile.class), anyString()))
                    .thenReturn(expected);
            gu.when(() -> GeneralUtils.generateFilename("ebook.epub", ".pdf"))
                    .thenReturn("ebook.pdf");

            assertSame(expected, controller.convertEbookToPdf(request));
        }

        ArgumentCaptor<OfficeToPdf.Options> options =
                ArgumentCaptor.forClass(OfficeToPdf.Options.class);
        Mockito.verify(officeToPdfService)
                .convert(
                        eq(workingDir.resolve("ebook.epub")),
                        eq(workingDir.resolve("ebook.pdf")),
                        options.capture());
        assertTrue(options.getValue().tableOfContents());
        assertTrue(options.getValue().pageNumbers());
        assertFalse(Files.exists(workingDir.resolve("ebook.epub")));
        assertFalse(Files.exists(workingDir.resolve("ebook.pdf")));
        Mockito.verify(tempFileManager).deleteTempDirectory(workingDir);
    }

    @Test
    void convertEbookToPdf_withUnsupportedExtensionThrows() {
        assertThrows(
                IllegalArgumentException.class,
                () -> controller.convertEbookToPdf(request("ebook.exe", new byte[] {1, 2, 3})));
    }

    @Test
    void convertEbookToPdf_withOptimizeForEbookUsesGhostscript() throws Exception {
        when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);
        ConvertEbookToPdfRequest request = request("ebook.epub", "content".getBytes());
        request.setOptimizeForEbook(true);
        converterWritesPdf();

        try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class)) {
            gu.when(() -> GeneralUtils.generateFilename("ebook.epub", ".pdf"))
                    .thenReturn("ebook.pdf");
            byte[] optimizedBytes = "optimized".getBytes(StandardCharsets.UTF_8);
            gu.when(() -> GeneralUtils.optimizePdfWithGhostscript(any(byte[].class)))
                    .thenReturn(optimizedBytes);
            ResponseEntity<Resource> expected =
                    ResponseEntity.ok(new ByteArrayResource(optimizedBytes));
            wr.when(() -> WebResponseUtils.pdfFileToWebResponse(any(TempFile.class), anyString()))
                    .thenReturn(expected);

            assertSame(expected, controller.convertEbookToPdf(request));
            gu.verify(() -> GeneralUtils.optimizePdfWithGhostscript(any(byte[].class)));
        }
        Mockito.verifyNoInteractions(pdfDocumentFactory);
        Mockito.verify(tempFileManager).deleteTempDirectory(workingDir);
    }

    @Test
    void convertEbookToPdf_sanitizesDocxBeforeConverting() throws Exception {
        byte[] uploaded = "linked-picture-docx".getBytes(StandardCharsets.UTF_8);
        byte[] sanitized = "sanitized-docx".getBytes(StandardCharsets.UTF_8);
        when(officeDocumentSanitizer.isSanitizableExtension("docx")).thenReturn(true);
        when(officeDocumentSanitizer.sanitize(uploaded, "docx")).thenReturn(sanitized);
        AtomicReference<byte[]> seen = new AtomicReference<>();
        Mockito.doAnswer(
                        inv -> {
                            seen.set(Files.readAllBytes(inv.getArgument(0)));
                            throw new IOException("conversion failed");
                        })
                .when(officeToPdfService)
                .convert(any(Path.class), any(Path.class), any(OfficeToPdf.Options.class));

        assertThrows(
                IOException.class,
                () -> controller.convertEbookToPdf(request("book.docx", uploaded)));

        assertArrayEquals(sanitized, seen.get());
        Mockito.verify(tempFileManager).deleteTempDirectory(workingDir);
    }

    @Test
    void convertEbookToPdf_rejectedDocxNeverConverts() throws Exception {
        byte[] uploaded = "docx".getBytes(StandardCharsets.UTF_8);
        when(officeDocumentSanitizer.isSanitizableExtension("docx")).thenReturn(true);
        when(officeDocumentSanitizer.sanitize(uploaded, "docx"))
                .thenThrow(new IOException("part could not be sanitized"));

        assertThrows(
                IOException.class,
                () -> controller.convertEbookToPdf(request("book.docx", uploaded)));

        Mockito.verify(officeToPdfService, Mockito.never())
                .convert(any(Path.class), any(Path.class), any(OfficeToPdf.Options.class));
        Mockito.verify(tempFileManager).deleteTempDirectory(workingDir);
    }

    @Test
    void convertEbookToPdf_missingOutputFails() throws Exception {
        IllegalStateException e =
                assertThrows(
                        IllegalStateException.class,
                        () -> controller.convertEbookToPdf(request("book.mobi", new byte[] {1})));
        assertEquals("The ebook converter did not produce a PDF output", e.getMessage());
    }

    private static void deleteRecursively(Path dir) throws IOException {
        if (dir == null || !Files.exists(dir)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(dir)) {
            paths.sorted(Comparator.reverseOrder())
                    .forEach(
                            path -> {
                                try {
                                    Files.deleteIfExists(path);
                                } catch (IOException ignored) {
                                }
                            });
        }
    }
}
