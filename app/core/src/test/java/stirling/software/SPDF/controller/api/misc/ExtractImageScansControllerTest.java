package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.misc.ExtractImageScansRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CheckProgramInstall;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

/**
 * Unit tests for {@link ExtractImageScansController}.
 *
 * <p>The controller shells out to a Python/OpenCV script via {@link ProcessExecutor} and gates on
 * {@link CheckProgramInstall#isPythonAvailable()}. To keep tests deterministic these static
 * boundaries are mocked with {@code Mockito.mockStatic}: Python is forced available/unavailable,
 * the script extraction is stubbed, and the process execution is replaced with an in-test answer
 * that either writes fake output PNGs into the controller-owned temp directory or leaves it empty.
 * No real Python process is ever launched.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ExtractImageScansControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    private TempFileManager tempFileManager;
    private ExtractImageScansController controller;

    @TempDir Path baseTmpDir;

    @BeforeEach
    void setUp() {
        stirling.software.common.model.ApplicationProperties applicationProperties =
                new stirling.software.common.model.ApplicationProperties();
        applicationProperties
                .getSystem()
                .getTempFileManagement()
                .setBaseTmpDir(baseTmpDir.toString());
        applicationProperties.getSystem().getTempFileManagement().setPrefix("scan-test-");

        tempFileManager = new TempFileManager(new TempFileRegistry(), applicationProperties);
        controller = new ExtractImageScansController(pdfDocumentFactory, tempFileManager);
    }

    /** Build a request with sensible defaults; the caller supplies the file input. */
    private ExtractImageScansRequest requestFor(MockMultipartFile file) {
        ExtractImageScansRequest request = new ExtractImageScansRequest();
        request.setFileInput(file);
        request.setAngleThreshold(5);
        request.setTolerance(20);
        request.setMinArea(8000);
        request.setMinContourArea(500);
        request.setBorderSize(1);
        return request;
    }

    /** A tiny single-page in-memory PDF backed by a small media box for cheap rendering. */
    private MockMultipartFile pdfFile(String name) throws IOException {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            // Keep the page small so the 300-DPI render stays tiny and fast.
            doc.addPage(new PDPage(new PDRectangle(72f, 72f)));
            doc.save(out);
            return new MockMultipartFile(
                    "fileInput", name, MediaType.APPLICATION_PDF_VALUE, out.toByteArray());
        }
    }

    /** A non-PDF image input; the controller copies it straight to a temp file. */
    private MockMultipartFile imageFile(String name) {
        return new MockMultipartFile(
                "fileInput", name, MediaType.IMAGE_PNG_VALUE, new byte[] {1, 2, 3, 4});
    }

    /**
     * A mocked {@link ProcessExecutor} whose {@code runCommandWithOutputHandling} reads the output
     * directory from the command (positional arg index 3) and writes the given number of PNG files
     * into it, mimicking the real split_photos.py behaviour without launching a process.
     */
    private ProcessExecutor execWritingOutputs(int outputCount) throws Exception {
        ProcessExecutor exec = mock(ProcessExecutor.class);
        when(exec.runCommandWithOutputHandling(anyList()))
                .thenAnswer(
                        invocation -> {
                            List<String> command = invocation.getArgument(0);
                            Path outDir = Path.of(command.get(3));
                            for (int i = 0; i < outputCount; i++) {
                                Files.write(
                                        outDir.resolve("out_" + i + ".png"),
                                        new byte[] {9, 8, 7, (byte) i});
                            }
                            return mock(ProcessExecutorResult.class);
                        });
        return exec;
    }

    @Nested
    @DisplayName("Python availability guard")
    class PythonGuard {

        @Test
        @DisplayName("throws IOException when Python is not installed")
        void throwsWhenPythonUnavailable() throws Exception {
            ExtractImageScansRequest request = requestFor(pdfFile("scan.pdf"));

            try (MockedStatic<CheckProgramInstall> check =
                    Mockito.mockStatic(CheckProgramInstall.class)) {
                check.when(CheckProgramInstall::isPythonAvailable).thenReturn(false);

                assertThrows(IOException.class, () -> controller.extractImageScans(request));
            }
        }

        @Test
        @DisplayName("does not load the PDF or extract the script when Python is missing")
        void shortCircuitsBeforeAnyWork() throws Exception {
            ExtractImageScansRequest request = requestFor(pdfFile("scan.pdf"));

            try (MockedStatic<CheckProgramInstall> check =
                            Mockito.mockStatic(CheckProgramInstall.class);
                    MockedStatic<GeneralUtils> general = Mockito.mockStatic(GeneralUtils.class)) {
                check.when(CheckProgramInstall::isPythonAvailable).thenReturn(false);

                assertThrows(IOException.class, () -> controller.extractImageScans(request));

                // Guard runs before document load and before script extraction.
                Mockito.verifyNoInteractions(pdfDocumentFactory);
                general.verifyNoInteractions();
            }
        }
    }

    @Nested
    @DisplayName("No detected images branch")
    class NoImagesBranch {

        @Test
        @DisplayName("throws IllegalArgumentException for a non-PDF input when no outputs produced")
        void throwsNoImagesForImageInput() throws Exception {
            ExtractImageScansRequest request = requestFor(imageFile("scan.png"));

            try (MockedStatic<CheckProgramInstall> check =
                            Mockito.mockStatic(CheckProgramInstall.class);
                    MockedStatic<GeneralUtils> general = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                check.when(CheckProgramInstall::isPythonAvailable).thenReturn(true);
                check.when(CheckProgramInstall::getAvailablePythonCommand).thenReturn("python3");
                general.when(() -> GeneralUtils.extractScript("split_photos.py"))
                        .thenReturn(Path.of("split_photos.py"));

                // Process produces zero output files -> empty result -> "no images" error.
                // Build the executor mock BEFORE stubbing the static so its inner when(...) does
                // not
                // nest inside this when(...).thenReturn(...) call.
                ProcessExecutor exec = execWritingOutputs(0);
                pe.when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV))
                        .thenReturn(exec);

                assertThrows(
                        IllegalArgumentException.class,
                        () -> controller.extractImageScans(request));
            }
        }

        @Test
        @DisplayName("throws IllegalArgumentException for a PDF input when no outputs produced")
        void throwsNoImagesForPdfInput() throws Exception {
            ExtractImageScansRequest request = requestFor(pdfFile("scan.pdf"));

            try (MockedStatic<CheckProgramInstall> check =
                            Mockito.mockStatic(CheckProgramInstall.class);
                    MockedStatic<GeneralUtils> general = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                check.when(CheckProgramInstall::isPythonAvailable).thenReturn(true);
                check.when(CheckProgramInstall::getAvailablePythonCommand).thenReturn("python3");
                general.when(() -> GeneralUtils.extractScript("split_photos.py"))
                        .thenReturn(Path.of("split_photos.py"));
                when(pdfDocumentFactory.load(
                                any(org.springframework.web.multipart.MultipartFile.class)))
                        .thenReturn(singlePageDocument());

                ProcessExecutor exec = execWritingOutputs(0);
                pe.when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV))
                        .thenReturn(exec);

                assertThrows(
                        IllegalArgumentException.class,
                        () -> controller.extractImageScans(request));

                // The PDF path must load the document exactly once.
                verify(pdfDocumentFactory, times(1))
                        .load(any(org.springframework.web.multipart.MultipartFile.class));
            }
        }
    }

    @Nested
    @DisplayName("Single image output branch")
    class SingleImageBranch {

        @Test
        @DisplayName("returns a single PNG response when exactly one image is detected")
        void returnsSinglePng() throws Exception {
            ExtractImageScansRequest request = requestFor(imageFile("scan.png"));

            try (MockedStatic<CheckProgramInstall> check =
                            Mockito.mockStatic(CheckProgramInstall.class);
                    MockedStatic<GeneralUtils> general = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                check.when(CheckProgramInstall::isPythonAvailable).thenReturn(true);
                check.when(CheckProgramInstall::getAvailablePythonCommand).thenReturn("python");
                general.when(() -> GeneralUtils.extractScript("split_photos.py"))
                        .thenReturn(Path.of("split_photos.py"));
                general.when(() -> GeneralUtils.generateFilename(anyString(), anyString()))
                        .thenAnswer(inv -> inv.<String>getArgument(0) + inv.<String>getArgument(1));

                ProcessExecutor exec = execWritingOutputs(1);
                pe.when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV))
                        .thenReturn(exec);

                ResponseEntity<Resource> response = controller.extractImageScans(request);

                assertNotNull(response);
                assertEquals(HttpStatus.OK, response.getStatusCode());
                assertEquals(MediaType.IMAGE_PNG, response.getHeaders().getContentType());
                assertNotNull(response.getBody());
            }
        }
    }

    @Nested
    @DisplayName("Multiple images (zip) output branch")
    class ZipBranch {

        @Test
        @DisplayName("returns a zip response when more than one image is detected")
        void returnsZipForMultipleImages() throws Exception {
            ExtractImageScansRequest request = requestFor(imageFile("scan.png"));

            try (MockedStatic<CheckProgramInstall> check =
                            Mockito.mockStatic(CheckProgramInstall.class);
                    MockedStatic<GeneralUtils> general = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                check.when(CheckProgramInstall::isPythonAvailable).thenReturn(true);
                check.when(CheckProgramInstall::getAvailablePythonCommand).thenReturn("python3");
                general.when(() -> GeneralUtils.extractScript("split_photos.py"))
                        .thenReturn(Path.of("split_photos.py"));
                general.when(() -> GeneralUtils.generateFilename(anyString(), anyString()))
                        .thenAnswer(inv -> inv.<String>getArgument(0) + inv.<String>getArgument(1));

                // Three output files -> zip path.
                ProcessExecutor exec = execWritingOutputs(3);
                pe.when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV))
                        .thenReturn(exec);

                ResponseEntity<Resource> response = controller.extractImageScans(request);

                assertNotNull(response);
                assertEquals(HttpStatus.OK, response.getStatusCode());
                assertNotNull(response.getBody());
                // generateFilename is invoked for the zip name and once per zip entry.
                general.verify(
                        () -> GeneralUtils.generateFilename(anyString(), anyString()),
                        atLeastOnce());
            }
        }
    }

    @Nested
    @DisplayName("Command construction")
    class CommandConstruction {

        @Test
        @DisplayName("passes the request parameters as CLI flags to the executor")
        void buildsExpectedCommand() throws Exception {
            MockMultipartFile file = imageFile("scan.png");
            ExtractImageScansRequest request = new ExtractImageScansRequest();
            request.setFileInput(file);
            request.setAngleThreshold(7);
            request.setTolerance(21);
            request.setMinArea(9000);
            request.setMinContourArea(600);
            request.setBorderSize(2);

            ProcessExecutor exec = mock(ProcessExecutor.class);
            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<String>> cmdCaptor = ArgumentCaptor.forClass(List.class);
            when(exec.runCommandWithOutputHandling(cmdCaptor.capture()))
                    .thenAnswer(invocation -> mock(ProcessExecutorResult.class));

            try (MockedStatic<CheckProgramInstall> check =
                            Mockito.mockStatic(CheckProgramInstall.class);
                    MockedStatic<GeneralUtils> general = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                check.when(CheckProgramInstall::isPythonAvailable).thenReturn(true);
                check.when(CheckProgramInstall::getAvailablePythonCommand).thenReturn("python3");
                general.when(() -> GeneralUtils.extractScript("split_photos.py"))
                        .thenReturn(Path.of("split_photos.py"));
                pe.when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV))
                        .thenReturn(exec);

                // No outputs are written, so the controller ultimately throws "no images";
                // we only care that the command was built and dispatched first.
                assertThrows(
                        IllegalArgumentException.class,
                        () -> controller.extractImageScans(request));

                List<String> command = cmdCaptor.getValue();
                assertNotNull(command);
                assertEquals("python3", command.get(0));
                assertTrue(command.contains("--angle_threshold"));
                assertEquals("7", valueAfter(command, "--angle_threshold"));
                assertEquals("21", valueAfter(command, "--tolerance"));
                assertEquals("9000", valueAfter(command, "--min_area"));
                assertEquals("600", valueAfter(command, "--min_contour_area"));
                assertEquals("2", valueAfter(command, "--border_size"));
            }
        }

        private String valueAfter(List<String> command, String flag) {
            int idx = command.indexOf(flag);
            assertTrue(idx >= 0 && idx + 1 < command.size(), "flag " + flag + " not found");
            return command.get(idx + 1);
        }
    }

    @Nested
    @DisplayName("Temp file cleanup")
    class Cleanup {

        @Test
        @DisplayName("leaves no controller temp files behind after a no-images failure")
        void cleansUpAfterFailure() throws Exception {
            ExtractImageScansRequest request = requestFor(imageFile("scan.png"));

            try (MockedStatic<CheckProgramInstall> check =
                            Mockito.mockStatic(CheckProgramInstall.class);
                    MockedStatic<GeneralUtils> general = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                check.when(CheckProgramInstall::isPythonAvailable).thenReturn(true);
                check.when(CheckProgramInstall::getAvailablePythonCommand).thenReturn("python3");
                general.when(() -> GeneralUtils.extractScript("split_photos.py"))
                        .thenReturn(Path.of("split_photos.py"));
                ProcessExecutor exec = execWritingOutputs(0);
                pe.when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV))
                        .thenReturn(exec);

                assertThrows(
                        IllegalArgumentException.class,
                        () -> controller.extractImageScans(request));

                try (var stream = Files.walk(baseTmpDir)) {
                    boolean leaked =
                            stream.filter(Files::isRegularFile)
                                    .map(p -> p.getFileName().toString())
                                    .anyMatch(n -> n.startsWith("scan-test-"));
                    assertFalse(leaked, "controller temp files should be cleaned up");
                }
            }
        }
    }

    /** Build a fresh single-page in-memory document the factory mock can hand back. */
    private PDDocument singlePageDocument() {
        PDDocument doc = new PDDocument();
        doc.addPage(new PDPage(new PDRectangle(72f, 72f)));
        return doc;
    }
}
