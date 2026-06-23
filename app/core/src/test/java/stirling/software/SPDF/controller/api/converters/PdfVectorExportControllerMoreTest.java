package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.converters.PdfVectorExportRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

/**
 * Gap coverage for {@link PdfVectorExportController#convertPdfToVector} and the Ghostscript
 * PDF-to-vector helper, complementing PdfVectorExportControllerTest (which only covers the
 * PostScript-to-PDF endpoint).
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("PdfVectorExportController convertPdfToVector")
class PdfVectorExportControllerMoreTest {

    private final List<Path> tempPaths = new ArrayList<>();

    @Mock private TempFileManager tempFileManager;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private ProcessExecutor ghostscriptExecutor;
    @InjectMocks private PdfVectorExportController controller;

    // Real manager used only to mint genuine TempFile instances for the mock to hand back.
    private final TempFileManager realTempFileManager =
            new TempFileManager(new TempFileRegistry(), new ApplicationProperties());

    private Map<ProcessExecutor.Processes, ProcessExecutor> originalExecutors;

    @BeforeEach
    void setup() throws Exception {
        // Return a real TempFile so no Mockito when() runs re-entrantly inside the thenAnswer.
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(inv -> realTempFileManager.createManagedTempFile(inv.getArgument(0)));
        lenient()
                .when(tempFileManager.createTempFile(any()))
                .thenAnswer(
                        invocation -> {
                            String suffix = invocation.<String>getArgument(0);
                            Path path =
                                    Files.createTempFile("vec_in", suffix == null ? "" : suffix);
                            tempPaths.add(path);
                            return path.toFile();
                        });

        Field instancesField = ProcessExecutor.class.getDeclaredField("instances");
        instancesField.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<ProcessExecutor.Processes, ProcessExecutor> instances =
                (Map<ProcessExecutor.Processes, ProcessExecutor>) instancesField.get(null);
        originalExecutors = Map.copyOf(instances);
        instances.clear();
        instances.put(ProcessExecutor.Processes.GHOSTSCRIPT, ghostscriptExecutor);
    }

    @AfterEach
    void tearDown() throws Exception {
        Field instancesField = ProcessExecutor.class.getDeclaredField("instances");
        instancesField.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<ProcessExecutor.Processes, ProcessExecutor> instances =
                (Map<ProcessExecutor.Processes, ProcessExecutor>) instancesField.get(null);
        instances.clear();
        if (originalExecutors != null) {
            instances.putAll(originalExecutors);
        }
        reset(ghostscriptExecutor, tempFileManager, endpointConfiguration);
        for (Path path : tempPaths) {
            Files.deleteIfExists(path);
        }
        tempPaths.clear();
    }

    private ProcessExecutorResult okResult() {
        ProcessExecutorResult result = mock(ProcessExecutorResult.class);
        lenient().when(result.getRc()).thenReturn(0);
        lenient().when(result.getMessages()).thenReturn("");
        return result;
    }

    private static PdfVectorExportRequest request(String outputFormat) {
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "in.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[] {1});
        PdfVectorExportRequest request = new PdfVectorExportRequest();
        request.setFileInput(file);
        request.setOutputFormat(outputFormat);
        return request;
    }

    @Nested
    @DisplayName("media types per output format")
    class MediaTypes {

        @Test
        @DisplayName("eps output yields application/postscript")
        void epsContentType() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);
            ProcessExecutorResult ok = okResult();
            when(ghostscriptExecutor.runCommandWithOutputHandling(any())).thenReturn(ok);

            ResponseEntity<Resource> response = controller.convertPdfToVector(request("eps"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getHeaders().getContentType())
                    .isEqualTo(MediaType.parseMediaType("application/postscript"));
        }

        @Test
        @DisplayName("ps output yields application/postscript")
        void psContentType() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);
            ProcessExecutorResult ok = okResult();
            when(ghostscriptExecutor.runCommandWithOutputHandling(any())).thenReturn(ok);

            ResponseEntity<Resource> response = controller.convertPdfToVector(request("ps"));

            assertThat(response.getHeaders().getContentType())
                    .isEqualTo(MediaType.parseMediaType("application/postscript"));
        }

        @Test
        @DisplayName("pcl output yields the HP-PCL media type")
        void pclContentType() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);
            ProcessExecutorResult ok = okResult();
            when(ghostscriptExecutor.runCommandWithOutputHandling(any())).thenReturn(ok);

            ResponseEntity<Resource> response = controller.convertPdfToVector(request("pcl"));

            assertThat(response.getHeaders().getContentType())
                    .isEqualTo(MediaType.parseMediaType("application/vnd.hp-PCL"));
        }

        @Test
        @DisplayName("xps output yields the MS XPS media type")
        void xpsContentType() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);
            ProcessExecutorResult ok = okResult();
            when(ghostscriptExecutor.runCommandWithOutputHandling(any())).thenReturn(ok);

            ResponseEntity<Resource> response = controller.convertPdfToVector(request("xps"));

            assertThat(response.getHeaders().getContentType())
                    .isEqualTo(MediaType.parseMediaType("application/vnd.ms-xpsdocument"));
        }

        @Test
        @DisplayName("null output format defaults to eps")
        void nullOutputFormatDefaultsToEps() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);
            ProcessExecutorResult ok = okResult();
            when(ghostscriptExecutor.runCommandWithOutputHandling(any())).thenReturn(ok);

            ResponseEntity<Resource> response = controller.convertPdfToVector(request(null));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getHeaders().getContentType())
                    .isEqualTo(MediaType.parseMediaType("application/postscript"));
        }

        @Test
        @DisplayName("uppercase output format is normalized to lowercase")
        void uppercaseFormatNormalized() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);
            ProcessExecutorResult ok = okResult();
            when(ghostscriptExecutor.runCommandWithOutputHandling(any())).thenReturn(ok);

            ResponseEntity<Resource> response = controller.convertPdfToVector(request("EPS"));

            assertThat(response.getHeaders().getContentType())
                    .isEqualTo(MediaType.parseMediaType("application/postscript"));
        }
    }

    @Nested
    @DisplayName("failure paths")
    class Failures {

        @Test
        @DisplayName("disabled Ghostscript group throws a conversion exception")
        void ghostscriptDisabledThrows() {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);

            assertThrows(Exception.class, () -> controller.convertPdfToVector(request("eps")));
        }

        @Test
        @DisplayName("non-zero Ghostscript return code throws a conversion exception")
        void nonZeroReturnCodeThrows() {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);
            ProcessExecutorResult bad = mock(ProcessExecutorResult.class);
            lenient().when(bad.getRc()).thenReturn(1);
            lenient().when(bad.getMessages()).thenReturn("some non-critical failure");
            try {
                when(ghostscriptExecutor.runCommandWithOutputHandling(any())).thenReturn(bad);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }

            assertThrows(Exception.class, () -> controller.convertPdfToVector(request("eps")));
        }

        @Test
        @DisplayName("an unsupported output format is rejected before any device mapping")
        void unsupportedFormatThrows() {
            // "svg" is not in the validated set and falls through to the device-switch default.
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);

            assertThrows(Exception.class, () -> controller.convertPdfToVector(request("svg")));
        }
    }

    @Test
    @DisplayName("Ghostscript runs the configured command for a successful conversion")
    void runsGhostscriptCommand() throws Exception {
        when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);
        ProcessExecutorResult ok = okResult();
        when(ghostscriptExecutor.runCommandWithOutputHandling(any())).thenReturn(ok);

        ResponseEntity<Resource> response = controller.convertPdfToVector(request("eps"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        org.mockito.Mockito.verify(ghostscriptExecutor).runCommandWithOutputHandling(any());
    }
}
