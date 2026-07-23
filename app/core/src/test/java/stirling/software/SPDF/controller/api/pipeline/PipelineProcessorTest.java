package stirling.software.SPDF.controller.api.pipeline;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;

import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineOperation;
import stirling.software.SPDF.model.PipelineResult;
import stirling.software.SPDF.service.ApiDocService;
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
                .thenReturn(new ResponseEntity<>(emptyResource, HttpStatus.OK));

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
                .thenReturn(new ResponseEntity<>(outputResource, HttpStatus.OK));

        PipelineResult result = pipelineProcessor.runPipelineAgainstFiles(files, config);

        verify(internalApiClient).post(anyString(), any());

        assertFalse(result.isHasErrors());

        Files.deleteIfExists(tempPath);
    }

    @Test
    void skipsBlankAllRequestParamsForMultipartBinding() throws Exception {
        PipelineOperation op = new PipelineOperation();
        op.setOperation("/api/v1/misc/update-metadata");
        op.setParameters(Map.of("title", "Updated title", "allRequestParams", ""));
        PipelineConfig config = new PipelineConfig();
        config.setOperations(List.of(op));

        Path tempPath = Files.createTempFile("test-output", ".pdf");
        Files.write(tempPath, "processed_data".getBytes());
        Resource outputResource =
                new FileSystemResource(tempPath.toFile()) {
                    @Override
                    public String getFilename() {
                        return "processed.pdf";
                    }
                };

        when(apiDocService.isMultiInput("/api/v1/misc/update-metadata")).thenReturn(false);
        when(apiDocService.getExtensionTypes(false, "/api/v1/misc/update-metadata"))
                .thenReturn(List.of("pdf"));
        when(apiDocService.isValidOperation(eq("/api/v1/misc/update-metadata"), anyMap()))
                .thenReturn(true);
        when(internalApiClient.post(eq("/api/v1/misc/update-metadata"), any()))
                .thenReturn(new ResponseEntity<>(outputResource, HttpStatus.OK));

        pipelineProcessor.runPipelineAgainstFiles(List.of(new MyFileByteArrayResource()), config);

        ArgumentCaptor<MultiValueMap> bodyCaptor = ArgumentCaptor.forClass(MultiValueMap.class);
        verify(internalApiClient).post(eq("/api/v1/misc/update-metadata"), bodyCaptor.capture());
        MultiValueMap<String, Object> body = bodyCaptor.getValue();

        assertEquals("Updated title", body.getFirst("title"));
        assertFalse(body.containsKey("allRequestParams"));

        Files.deleteIfExists(tempPath);
    }

    @Test
    void expandsAllRequestParamsMapForMultipartBinding() throws Exception {
        PipelineOperation op = new PipelineOperation();
        op.setOperation("/api/v1/misc/update-metadata");
        op.setParameters(
                Map.of(
                        "title",
                        "Updated title",
                        "allRequestParams",
                        Map.of("customKey1", "Department", "customValue1", "Engineering")));
        PipelineConfig config = new PipelineConfig();
        config.setOperations(List.of(op));

        Path tempPath = Files.createTempFile("test-output", ".pdf");
        Files.write(tempPath, "processed_data".getBytes());
        Resource outputResource =
                new FileSystemResource(tempPath.toFile()) {
                    @Override
                    public String getFilename() {
                        return "processed.pdf";
                    }
                };

        when(apiDocService.isMultiInput("/api/v1/misc/update-metadata")).thenReturn(false);
        when(apiDocService.getExtensionTypes(false, "/api/v1/misc/update-metadata"))
                .thenReturn(List.of("pdf"));
        when(apiDocService.isValidOperation(eq("/api/v1/misc/update-metadata"), anyMap()))
                .thenReturn(true);
        when(internalApiClient.post(eq("/api/v1/misc/update-metadata"), any()))
                .thenReturn(new ResponseEntity<>(outputResource, HttpStatus.OK));

        pipelineProcessor.runPipelineAgainstFiles(List.of(new MyFileByteArrayResource()), config);

        ArgumentCaptor<MultiValueMap> bodyCaptor = ArgumentCaptor.forClass(MultiValueMap.class);
        verify(internalApiClient).post(eq("/api/v1/misc/update-metadata"), bodyCaptor.capture());
        MultiValueMap<String, Object> body = bodyCaptor.getValue();

        assertEquals("Updated title", body.getFirst("title"));
        assertEquals("Department", body.getFirst("allRequestParams[customKey1]"));
        assertEquals("Engineering", body.getFirst("allRequestParams[customValue1]"));
        assertFalse(body.containsKey("allRequestParams"));

        Files.deleteIfExists(tempPath);
    }

    private static class MyFileByteArrayResource extends ByteArrayResource {
        public MyFileByteArrayResource() {
            super("data".getBytes());
        }

        @Override
        public String getFilename() {
            return "test.pdf";
        }
    }
}
