package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.misc.ProcessPdfWithOcrRequest;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

/**
 * Unit tests for {@link OCRController}. OCR shells out to tesseract/ocrmypdf, so these tests focus
 * on the pure, deterministic surface: tesseract-language discovery and the request validation /
 * tool-availability branches that all complete (or fail) before any external process is launched.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class OCRControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private RuntimePathConfig runtimePathConfig;

    private TempFileManager tempFileManager;
    private ApplicationProperties applicationProperties;
    private OCRController ocrController;

    @TempDir Path baseTmpDir;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        applicationProperties
                .getSystem()
                .getTempFileManagement()
                .setBaseTmpDir(baseTmpDir.toString());
        applicationProperties.getSystem().getTempFileManagement().setPrefix("ocr-test-");

        tempFileManager = new TempFileManager(new TempFileRegistry(), applicationProperties);

        ocrController =
                new OCRController(
                        applicationProperties,
                        pdfDocumentFactory,
                        tempFileManager,
                        endpointConfiguration,
                        runtimePathConfig);
    }

    /** Build a minimal request with sensible defaults the caller can override. */
    private ProcessPdfWithOcrRequest baseRequest() {
        ProcessPdfWithOcrRequest request = new ProcessPdfWithOcrRequest();
        request.setLanguages(List.of("eng"));
        request.setOcrRenderType("hocr");
        request.setOcrType("skip-text");
        return request;
    }

    /** Build a tiny single-page in-memory PDF as a MockMultipartFile. */
    private MockMultipartFile pdfMultipartFile(String name) throws IOException {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            doc.addPage(new PDPage());
            doc.save(out);
            return new MockMultipartFile(
                    "fileInput", name, MediaType.APPLICATION_PDF_VALUE, out.toByteArray());
        }
    }

    /** Create a tessdata directory populated with the given traineddata languages. */
    private Path tessdataDirWith(String... languages) throws IOException {
        Path dir = Files.createTempDirectory(baseTmpDir, "tessdata");
        for (String lang : languages) {
            Files.createFile(dir.resolve(lang + ".traineddata"));
        }
        return dir;
    }

    @Nested
    @DisplayName("getAvailableTesseractLanguages")
    class GetAvailableTesseractLanguages {

        @Test
        @DisplayName("returns trained languages and excludes osd")
        void returnsTrainedLanguagesExcludingOsd() throws IOException {
            Path tessdata = tessdataDirWith("eng", "deu", "osd");
            // A non-traineddata file must be ignored entirely.
            Files.createFile(tessdata.resolve("readme.txt"));
            when(runtimePathConfig.getTessDataPath()).thenReturn(tessdata.toString());

            List<String> langs = ocrController.getAvailableTesseractLanguages();

            assertTrue(langs.contains("eng"));
            assertTrue(langs.contains("deu"));
            assertFalse(langs.contains("osd"), "osd must be filtered out");
            assertFalse(langs.contains("readme"), "non-traineddata files must be ignored");
            assertEquals(2, langs.size());
        }

        @Test
        @DisplayName("filters osd case-insensitively")
        void filtersOsdCaseInsensitively() throws IOException {
            Path tessdata = tessdataDirWith("eng", "OSD");
            when(runtimePathConfig.getTessDataPath()).thenReturn(tessdata.toString());

            List<String> langs = ocrController.getAvailableTesseractLanguages();

            assertEquals(List.of("eng"), langs);
        }

        @Test
        @DisplayName("returns empty list when directory has no traineddata files")
        void returnsEmptyWhenNoTrainedData() throws IOException {
            Path empty = Files.createTempDirectory(baseTmpDir, "empty-tessdata");
            when(runtimePathConfig.getTessDataPath()).thenReturn(empty.toString());

            assertTrue(ocrController.getAvailableTesseractLanguages().isEmpty());
        }

        @Test
        @DisplayName("returns empty list when directory does not exist")
        void returnsEmptyWhenDirectoryMissing() {
            Path missing = baseTmpDir.resolve("does-not-exist");
            when(runtimePathConfig.getTessDataPath()).thenReturn(missing.toString());

            // listFiles() on a non-directory returns null -> empty list, not an exception.
            assertTrue(ocrController.getAvailableTesseractLanguages().isEmpty());
        }
    }

    @Nested
    @DisplayName("processPdfWithOCR validation branches")
    class ValidationBranches {

        @Test
        @DisplayName("throws when languages list is null")
        void throwsWhenLanguagesNull() throws IOException {
            ProcessPdfWithOcrRequest request = baseRequest();
            request.setLanguages(null);
            request.setFileInput(pdfMultipartFile("in.pdf"));

            assertThrows(IOException.class, () -> ocrController.processPdfWithOCR(request));
            // Validation happens before any tool/exec interaction.
            verifyNoInteractions(endpointConfiguration);
        }

        @Test
        @DisplayName("throws when languages list is empty")
        void throwsWhenLanguagesEmpty() throws IOException {
            ProcessPdfWithOcrRequest request = baseRequest();
            request.setLanguages(Collections.emptyList());
            request.setFileInput(pdfMultipartFile("in.pdf"));

            assertThrows(IOException.class, () -> ocrController.processPdfWithOCR(request));
            verifyNoInteractions(endpointConfiguration);
        }

        @Test
        @DisplayName("throws when ocrRenderType is invalid")
        void throwsWhenRenderTypeInvalid() throws IOException {
            ProcessPdfWithOcrRequest request = baseRequest();
            request.setOcrRenderType("bogus");
            request.setFileInput(pdfMultipartFile("in.pdf"));

            assertThrows(IOException.class, () -> ocrController.processPdfWithOCR(request));
            // Render-type check precedes language availability lookup.
            verify(runtimePathConfig, never()).getTessDataPath();
        }

        @Test
        @DisplayName("accepts sandwich render type past the render-type check")
        void sandwichRenderTypePassesRenderCheck() throws IOException {
            ProcessPdfWithOcrRequest request = baseRequest();
            request.setOcrRenderType("sandwich");
            request.setLanguages(List.of("eng"));
            request.setFileInput(pdfMultipartFile("in.pdf"));
            // No tessdata languages available -> falls through to invalid-languages, still an
            // IOException, but proves "sandwich" was not rejected by the render-type guard.
            Path tessdata = tessdataDirWith("eng");
            when(runtimePathConfig.getTessDataPath()).thenReturn(tessdata.toString());
            when(endpointConfiguration.isGroupEnabled("OCRmyPDF")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("tesseract")).thenReturn(false);

            // eng is available, so it gets past language validation and reaches the
            // tool-availability check, which throws because both tools are disabled.
            assertThrows(IOException.class, () -> ocrController.processPdfWithOCR(request));
            verify(runtimePathConfig).getTessDataPath();
        }

        @Test
        @DisplayName("throws when none of the selected languages are available")
        void throwsWhenNoSelectedLanguageAvailable() throws IOException {
            ProcessPdfWithOcrRequest request = baseRequest();
            request.setLanguages(List.of("xyz")); // not present in tessdata
            request.setFileInput(pdfMultipartFile("in.pdf"));

            Path tessdata = tessdataDirWith("eng", "deu");
            when(runtimePathConfig.getTessDataPath()).thenReturn(tessdata.toString());

            assertThrows(IOException.class, () -> ocrController.processPdfWithOCR(request));
            // Should fail before consulting tool availability.
            verify(endpointConfiguration, never()).isGroupEnabled(anyString());
        }
    }

    @Nested
    @DisplayName("processPdfWithOCR tool-availability branch")
    class ToolAvailabilityBranch {

        @Test
        @DisplayName("throws when both OCRmyPDF and tesseract are unavailable")
        void throwsWhenNoOcrToolsAvailable() throws IOException {
            ProcessPdfWithOcrRequest request = baseRequest();
            request.setLanguages(List.of("eng"));
            request.setFileInput(pdfMultipartFile("in.pdf"));

            Path tessdata = tessdataDirWith("eng");
            when(runtimePathConfig.getTessDataPath()).thenReturn(tessdata.toString());
            when(endpointConfiguration.isGroupEnabled("OCRmyPDF")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("tesseract")).thenReturn(false);

            assertThrows(IOException.class, () -> ocrController.processPdfWithOCR(request));

            verify(endpointConfiguration).isGroupEnabled("OCRmyPDF");
            verify(endpointConfiguration).isGroupEnabled("tesseract");
        }

        @Test
        @DisplayName("temp input/output files are cleaned up after a failure")
        void tempFilesCleanedUpAfterFailure() throws IOException {
            ProcessPdfWithOcrRequest request = baseRequest();
            request.setLanguages(List.of("eng"));
            request.setFileInput(pdfMultipartFile("in.pdf"));

            Path tessdata = tessdataDirWith("eng");
            when(runtimePathConfig.getTessDataPath()).thenReturn(tessdata.toString());
            when(endpointConfiguration.isGroupEnabled("OCRmyPDF")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("tesseract")).thenReturn(false);

            assertThrows(IOException.class, () -> ocrController.processPdfWithOCR(request));

            // The only files left under the temp dir should be our tessdata dir and its
            // contents; the controller's .pdf temp files must have been closed/deleted.
            try (var stream = Files.walk(baseTmpDir)) {
                boolean leakedPdf =
                        stream.filter(Files::isRegularFile)
                                .map(p -> p.getFileName().toString())
                                .filter(n -> n.startsWith("ocr-test-"))
                                .anyMatch(n -> n.endsWith(".pdf"));
                assertFalse(leakedPdf, "controller temp PDF files should be cleaned up");
            }
        }
    }

    @Test
    @DisplayName("getAvailableTesseractLanguages survives a path that is a regular file")
    void languagesEmptyWhenPathIsRegularFile() throws IOException {
        File regularFile = Files.createTempFile(baseTmpDir, "not-a-dir", ".bin").toFile();
        when(runtimePathConfig.getTessDataPath()).thenReturn(regularFile.getAbsolutePath());

        // listFiles() on a regular file returns null -> empty list.
        assertTrue(ocrController.getAvailableTesseractLanguages().isEmpty());
    }
}
