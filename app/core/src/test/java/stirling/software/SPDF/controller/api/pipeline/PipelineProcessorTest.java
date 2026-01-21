package stirling.software.SPDF.controller.api.pipeline;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedConstruction;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import jakarta.servlet.ServletContext;

import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineOperation;
import stirling.software.SPDF.model.PipelineResult;
import stirling.software.SPDF.service.ApiDocService;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class PipelineProcessorTest {

    @Mock ApiDocService apiDocService;

    @Mock UserServiceInterface userService;

    @Mock ServletContext servletContext;

    @Mock TempFileManager tempFileManager;

    PipelineProcessor pipelineProcessor;

    @BeforeEach
    void setUp() {
        pipelineProcessor =
                spy(
                        new PipelineProcessor(
                                apiDocService, userService, servletContext, tempFileManager));
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

        // Use a FileSystemResource backed by a temp file to avoid FileNotFoundException
        Path emptyTemp = Files.createTempFile("empty", ".tmp");
        Resource emptyResource = new FileSystemResource(emptyTemp.toFile());

        doReturn(new ResponseEntity<>(emptyResource, HttpStatus.OK))
                .when(pipelineProcessor)
                .sendWebRequest(anyString(), any());

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

        doReturn(new ResponseEntity<>(outputResource, HttpStatus.OK))
                .when(pipelineProcessor)
                .sendWebRequest(anyString(), any());

        PipelineResult result = pipelineProcessor.runPipelineAgainstFiles(files, config);

        verify(pipelineProcessor).sendWebRequest(anyString(), any());

        assertFalse(result.isHasErrors());

        // Clean up
        Files.deleteIfExists(tempPath);
    }

    @Test
    void sendWebRequestDoesNotForceContentType() throws Exception {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add(
                "fileInput",
                new ByteArrayResource("data".getBytes(StandardCharsets.UTF_8)) {
                    @Override
                    public String getFilename() {
                        return "input.pdf";
                    }
                });

        Path tempPath = Files.createTempFile("pipeline-test", ".tmp");
        var tempFile = mock(stirling.software.common.util.TempFile.class);
        when(tempFile.getPath()).thenReturn(tempPath);
        when(tempFile.getFile()).thenReturn(tempPath.toFile());
        when(tempFileManager.createManagedTempFile("pipeline")).thenReturn(tempFile);

        var capturedHeaders = new org.springframework.http.HttpHeaders[1];

        try (MockedConstruction<org.springframework.web.client.RestTemplate> ignored =
                mockConstruction(
                        org.springframework.web.client.RestTemplate.class,
                        (mock, context) -> {
                            when(mock.httpEntityCallback(any(), eq(Resource.class)))
                                    .thenAnswer(
                                            invocation -> {
                                                var entity = invocation.getArgument(0);
                                                capturedHeaders[0] =
                                                        ((org.springframework.http.HttpEntity<?>)
                                                                        entity)
                                                                .getHeaders();
                                                return (org.springframework.web.client
                                                                .RequestCallback)
                                                        request -> {};
                                            });

                            when(mock.execute(
                                            anyString(),
                                            eq(org.springframework.http.HttpMethod.POST),
                                            any(),
                                            any()))
                                    .thenAnswer(
                                            invocation -> {
                                                @SuppressWarnings("unchecked")
                                                var extractor =
                                                        (org.springframework.web.client
                                                                                .ResponseExtractor<
                                                                        ResponseEntity<Resource>>)
                                                                invocation.getArgument(3);
                                                ClientHttpResponse response =
                                                        mock(ClientHttpResponse.class);
                                                when(response.getBody())
                                                        .thenReturn(
                                                                new ByteArrayInputStream(
                                                                        "ok"
                                                                                .getBytes(
                                                                                        StandardCharsets
                                                                                                .UTF_8)));
                                                var headers =
                                                        new org.springframework.http.HttpHeaders();
                                                headers.add(
                                                        org.springframework.http.HttpHeaders
                                                                .CONTENT_DISPOSITION,
                                                        "attachment; filename=\"out.pdf\"");
                                                when(response.getHeaders()).thenReturn(headers);
                                                when(response.getStatusCode())
                                                        .thenReturn(HttpStatus.OK);
                                                when(response.getRawStatusCode())
                                                        .thenReturn(HttpStatus.OK.value());
                                                return extractor.extractData(response);
                                            });
                        })) {
            ResponseEntity<Resource> response =
                    pipelineProcessor.sendWebRequest("http://localhost/api", body);

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            assertNull(capturedHeaders[0].getContentType());
        } finally {
            Files.deleteIfExists(tempPath);
        }
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
