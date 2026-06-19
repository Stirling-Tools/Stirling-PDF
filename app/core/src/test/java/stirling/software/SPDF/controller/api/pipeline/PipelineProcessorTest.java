package stirling.software.SPDF.controller.api.pipeline;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineOperation;
import stirling.software.SPDF.model.PipelineResult;
import stirling.software.SPDF.service.ApiDocService;
import stirling.software.common.model.io.FileSystemResource;
import stirling.software.common.model.io.Resource;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class PipelineProcessorTest {

    @Mock ApiDocService apiDocService;

    @Mock InternalApiClient internalApiClient;

    @Mock TempFileManager tempFileManager;

    PipelineProcessor pipelineProcessor;

    @BeforeEach
    void setUp() throws Exception {
        pipelineProcessor =
                new PipelineProcessor(apiDocService, internalApiClient, tempFileManager);
    }

    @Test
    void runPipelineWithFilterSetsFlag() throws Exception {
        PipelineOperation op = new PipelineOperation();
        op.setOperation("/api/v1/filter/filter-page-count");
        op.setParameters(Map.of());
        PipelineConfig config = new PipelineConfig();
        config.setOperations(List.of(op));

        Resource file = new MyFileByteArrayResource();
        List<Resource> files = List.of(file);

        when(apiDocService.isMultiInput("/api/v1/filter/filter-page-count")).thenReturn(false);
        when(apiDocService.getExtensionTypes(false, "/api/v1/filter/filter-page-count"))
                .thenReturn(List.of("pdf"));
        when(apiDocService.isValidOperation(eq("/api/v1/filter/filter-page-count"), anyMap()))
                .thenReturn(true);

        Path emptyTemp = Files.createTempFile("empty", ".tmp");
        Resource emptyResource = new FileSystemResource(emptyTemp.toFile());

        when(internalApiClient.post(anyString(), any()))
                .thenReturn(Response.ok(emptyResource).build());

        PipelineResult result = pipelineProcessor.runPipelineAgainstFiles(files, config);

        Files.deleteIfExists(emptyTemp);

        assertTrue(
                result.isFiltersApplied(),
                "Filter flag should be true when operation filters file");
        assertFalse(result.isHasErrors(), "No errors should occur");
        assertTrue(result.getOutputFiles().isEmpty(), "Filtered file list should be empty");
    }

    @Test
    void testPipelineSuccessWithResource() throws Exception {
        PipelineOperation op = new PipelineOperation();
        op.setOperation("/api/v1/misc/compress");
        op.setParameters(Map.of());
        PipelineConfig config = new PipelineConfig();
        config.setOperations(List.of(op));

        Resource inputFile = new MyFileByteArrayResource();
        List<Resource> files = List.of(inputFile);

        Path tempPath = Files.createTempFile("test-output", ".pdf");
        Files.write(tempPath, "processed_data".getBytes());
        Resource outputResource =
                new FileSystemResource(tempPath.toFile()) {
                    @Override
                    public String getFilename() {
                        return "processed.pdf";
                    }
                };

        when(apiDocService.isMultiInput(anyString())).thenReturn(false);
        when(apiDocService.getExtensionTypes(anyBoolean(), anyString())).thenReturn(List.of("pdf"));
        when(apiDocService.isValidOperation(anyString(), anyMap())).thenReturn(true);

        when(internalApiClient.post(anyString(), any()))
                .thenReturn(Response.ok(outputResource).build());

        PipelineResult result = pipelineProcessor.runPipelineAgainstFiles(files, config);

        verify(internalApiClient).post(anyString(), any());

        assertFalse(result.isHasErrors());

        Files.deleteIfExists(tempPath);
    }

    /**
     * In-memory {@link Resource} reporting a {@code .pdf} filename. Replaces the former Spring
     * {@code ByteArrayResource} subclass: the pipeline only consults {@link #getFilename()} for
     * extension matching here, the mocked {@link InternalApiClient} ignores the request body.
     */
    private static class MyFileByteArrayResource implements Resource {

        private final byte[] data = "data".getBytes();

        @Override
        public InputStream getInputStream() {
            return new ByteArrayInputStream(data);
        }

        @Override
        public boolean exists() {
            return true;
        }

        @Override
        public String getFilename() {
            return "test.pdf";
        }

        @Override
        public long contentLength() {
            return data.length;
        }

        @Override
        public java.io.File getFile() throws java.io.IOException {
            throw new java.io.IOException("not file-backed");
        }
    }
}
