package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.StreamingOutput;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class PdfVectorExportControllerTest {

    private final List<Path> tempPaths = new ArrayList<>();
    @Mock private TempFileManager tempFileManager;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private ProcessExecutor ghostscriptExecutor;
    @InjectMocks private PdfVectorExportController controller;
    private Map<ProcessExecutor.Processes, ProcessExecutor> originalExecutors;

    @BeforeEach
    void setup() throws Exception {
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
        when(tempFileManager.createTempFile(any()))
                .thenAnswer(
                        invocation -> {
                            String suffix = invocation.<String>getArgument(0);
                            Path path =
                                    Files.createTempFile(
                                            "vector_test", suffix == null ? "" : suffix);
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

    private ProcessExecutorResult mockResult(int rc) {
        ProcessExecutorResult result = mock(ProcessExecutorResult.class);
        lenient().when(result.getRc()).thenReturn(rc);
        lenient().when(result.getMessages()).thenReturn("");
        return result;
    }

    private static byte[] drainBody(Response response) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ((StreamingOutput) response.getEntity()).write(baos);
        return baos.toByteArray();
    }

    @Test
    void convertGhostscript_psToPdf_success() throws Exception {
        when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);
        ProcessExecutorResult result = mockResult(0);
        when(ghostscriptExecutor.runCommandWithOutputHandling(any())).thenReturn(result);

        FileUpload file =
                TestFileUploads.of(new byte[] {1}, "sample.ps", MediaType.APPLICATION_OCTET_STREAM);

        Response response = controller.convertGhostscriptInputsToPdf(file, null);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getMediaType()).isEqualTo(MediaType.valueOf("application/pdf"));
    }

    @Test
    void convertGhostscript_pdfPassThrough_success() throws Exception {
        when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);

        byte[] content = {1};
        FileUpload file = TestFileUploads.of(content, "input.pdf", "application/pdf");

        Response response = controller.convertGhostscriptInputsToPdf(file, null);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getMediaType()).isEqualTo(MediaType.valueOf("application/pdf"));
        assertThat(drainBody(response)).contains(content);
    }

    @Test
    void convertGhostscript_unsupportedFormatThrows() {
        when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);
        FileUpload file = TestFileUploads.of(new byte[] {1}, "vector.svg", "application/xml");

        assertThrows(
                IllegalArgumentException.class,
                () -> controller.convertGhostscriptInputsToPdf(file, null));
    }
}
