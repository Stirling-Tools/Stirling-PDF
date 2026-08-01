package stirling.software.SPDF.controller.api.pipeline;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineResult;
import stirling.software.SPDF.model.api.HandleDataRequest;
import stirling.software.common.service.PostHogService;
import stirling.software.common.util.TempFileManager;

import tools.jackson.databind.ObjectMapper;

/**
 * Unit tests for {@link PipelineController#handleData}. The controller is exercised directly with a
 * real {@link ObjectMapper} for JSON parsing and mocked collaborators for the processor, analytics
 * and temp-file management. The {@link TempFileManager} is stubbed to hand out real on-disk temp
 * files so the {@code TempFile} wrapper and the stream-copy / zip paths run for real.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PipelineControllerGapTest {

    @Mock private PipelineProcessor processor;

    @Mock private PostHogService postHogService;

    @Mock private TempFileManager tempFileManager;

    private ObjectMapper objectMapper;
    private PipelineController controller;

    // Real temp files handed back by the mocked TempFileManager; cleaned up after each test.
    private final List<Path> createdTempFiles = new ArrayList<>();

    private static final String VALID_JSON =
            "{\"name\":\"test-pipeline\",\"pipeline\":["
                    + "{\"operation\":\"/api/v1/misc/repair\",\"parameters\":{}}]}";

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        controller =
                new PipelineController(processor, objectMapper, postHogService, tempFileManager);
    }

    /**
     * Stub the manager so every {@code new TempFile(manager, suffix)} the controller builds gets a
     * real on-disk file. Only invoked by tests that actually exercise an output path, so tests that
     * short-circuit can assert {@code verifyNoInteractions(tempFileManager)}.
     */
    private void stubTempFiles() throws IOException {
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(
                        invocation -> {
                            String suffix = invocation.getArgument(0);
                            Path p = Files.createTempFile("pipeline-gap-test-", suffix);
                            createdTempFiles.add(p);
                            return p.toFile();
                        });
    }

    @AfterEach
    void tearDown() throws IOException {
        for (Path p : createdTempFiles) {
            Files.deleteIfExists(p);
        }
        createdTempFiles.clear();
    }

    private HandleDataRequest request(MultipartFile[] files, String json) {
        HandleDataRequest req = new HandleDataRequest();
        req.setFileInput(files);
        req.setJson(json);
        return req;
    }

    private MockMultipartFile pdf(String name) {
        return new MockMultipartFile(
                "fileInput", name, "application/pdf", ("content of " + name).getBytes());
    }

    private MultipartFile[] oneFile() {
        return new MultipartFile[] {pdf("input.pdf")};
    }

    /** A Resource backed by bytes that also reports a filename (ByteArrayResource returns null). */
    private static Resource namedResource(String filename, byte[] data) {
        return new ByteArrayResource(data) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
    }

    @Nested
    @DisplayName("Null / empty input short-circuits")
    class NullAndEmptyInputs {

        @Test
        @DisplayName("returns null when file input is null without touching collaborators")
        void nullFiles_returnsNull() throws Exception {
            ResponseEntity<Resource> response = controller.handleData(request(null, VALID_JSON));

            assertNull(response);
            verifyNoInteractions(processor);
            verifyNoInteractions(postHogService);
            verifyNoInteractions(tempFileManager);
        }

        @Test
        @DisplayName("returns null when processor yields no input files")
        void nullInputFiles_returnsNull() throws Exception {
            MultipartFile[] files = oneFile();
            when(processor.generateInputFiles(files)).thenReturn(null);

            ResponseEntity<Resource> response = controller.handleData(request(files, VALID_JSON));

            assertNull(response);
            // Event still captured before processing begins.
            verify(postHogService).captureEvent(eq("pipeline_api_event"), any());
            verify(processor, never()).runPipelineAgainstFiles(any(), any());
        }

        @Test
        @DisplayName("returns null when processor yields an empty input list")
        void emptyInputFiles_returnsNull() throws Exception {
            MultipartFile[] files = oneFile();
            when(processor.generateInputFiles(files)).thenReturn(new ArrayList<>());

            ResponseEntity<Resource> response = controller.handleData(request(files, VALID_JSON));

            assertNull(response);
            verify(processor, never()).runPipelineAgainstFiles(any(), any());
        }

        @Test
        @DisplayName("returns null when pipeline result has null output files")
        void nullOutputFiles_returnsNull() throws Exception {
            MultipartFile[] files = oneFile();
            List<Resource> inputFiles = List.of(namedResource("input.pdf", "x".getBytes()));
            when(processor.generateInputFiles(files)).thenReturn(inputFiles);

            PipelineResult result = new PipelineResult();
            result.setOutputFiles(null);
            when(processor.runPipelineAgainstFiles(any(), any())).thenReturn(result);

            ResponseEntity<Resource> response = controller.handleData(request(files, VALID_JSON));

            assertNull(response);
        }
    }

    @Nested
    @DisplayName("Single output file path")
    class SingleOutput {

        @Test
        @DisplayName("returns the single file streamed through a temp file")
        void singleOutput_returnsFileResponse() throws Exception {
            stubTempFiles();
            MultipartFile[] files = oneFile();
            List<Resource> inputFiles = List.of(namedResource("input.pdf", "in".getBytes()));
            when(processor.generateInputFiles(files)).thenReturn(inputFiles);

            byte[] outBytes = "single output body".getBytes(StandardCharsets.UTF_8);
            Resource single = namedResource("result.pdf", outBytes);
            PipelineResult result = new PipelineResult();
            result.setOutputFiles(List.of(single));
            when(processor.runPipelineAgainstFiles(any(), any())).thenReturn(result);

            ResponseEntity<Resource> response = controller.handleData(request(files, VALID_JSON));

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());

            // The controller copied the single file into a ".out" temp file.
            verify(tempFileManager).createTempFile(".out");

            // The streamed body matches what the processor produced.
            try (InputStream is = response.getBody().getInputStream()) {
                assertEquals(
                        new String(outBytes, StandardCharsets.UTF_8),
                        new String(is.readAllBytes(), StandardCharsets.UTF_8));
            }
        }

        @Test
        @DisplayName("captures analytics event with operations and file count")
        void singleOutput_capturesAnalytics() throws Exception {
            stubTempFiles();
            MultipartFile[] files = oneFile();
            when(processor.generateInputFiles(files))
                    .thenReturn(List.of(namedResource("input.pdf", "in".getBytes())));

            PipelineResult result = new PipelineResult();
            result.setOutputFiles(List.of(namedResource("result.pdf", "body".getBytes())));
            when(processor.runPipelineAgainstFiles(any(), any())).thenReturn(result);

            controller.handleData(request(files, VALID_JSON));

            @SuppressWarnings("unchecked")
            ArgumentCaptor<Map<String, Object>> propsCaptor = ArgumentCaptor.forClass(Map.class);
            verify(postHogService).captureEvent(eq("pipeline_api_event"), propsCaptor.capture());

            Map<String, Object> props = propsCaptor.getValue();
            assertEquals(1, props.get("fileCount"));
            assertEquals(List.of("/api/v1/misc/repair"), props.get("operations"));
        }
    }

    @Nested
    @DisplayName("Multiple output files (zip) path")
    class MultipleOutput {

        @Test
        @DisplayName("zips multiple output files into output.zip")
        void multipleOutputs_returnsZipResponse() throws Exception {
            stubTempFiles();
            MultipartFile[] files = oneFile();
            when(processor.generateInputFiles(files))
                    .thenReturn(List.of(namedResource("input.pdf", "in".getBytes())));

            Resource a = namedResource("a.pdf", "alpha".getBytes(StandardCharsets.UTF_8));
            Resource b = namedResource("b.pdf", "bravo".getBytes(StandardCharsets.UTF_8));
            PipelineResult result = new PipelineResult();
            result.setOutputFiles(List.of(a, b));
            when(processor.runPipelineAgainstFiles(any(), any())).thenReturn(result);

            ResponseEntity<Resource> response = controller.handleData(request(files, VALID_JSON));

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            verify(tempFileManager).createTempFile(".zip");

            // Inspect zip contents: both entries present with their bytes.
            Map<String, String> entries = readZip(response.getBody());
            assertEquals(2, entries.size());
            assertEquals("alpha", entries.get("a.pdf"));
            assertEquals("bravo", entries.get("b.pdf"));
        }

        @Test
        @DisplayName("duplicate filenames are de-duplicated within the zip")
        void multipleOutputs_duplicateNames_areDeduped() throws Exception {
            stubTempFiles();
            MultipartFile[] files = oneFile();
            when(processor.generateInputFiles(files))
                    .thenReturn(List.of(namedResource("input.pdf", "in".getBytes())));

            Resource first = namedResource("dup.pdf", "first".getBytes(StandardCharsets.UTF_8));
            Resource second = namedResource("dup.pdf", "second".getBytes(StandardCharsets.UTF_8));
            PipelineResult result = new PipelineResult();
            result.setOutputFiles(List.of(first, second));
            when(processor.runPipelineAgainstFiles(any(), any())).thenReturn(result);

            ResponseEntity<Resource> response = controller.handleData(request(files, VALID_JSON));

            assertNotNull(response);
            Map<String, String> entries = readZip(response.getBody());
            // Two distinct zip entry names despite the same source filename.
            assertEquals(2, entries.size());
        }

        private Map<String, String> readZip(Resource zipResource) throws IOException {
            Map<String, String> out = new java.util.LinkedHashMap<>();
            byte[] all;
            try (InputStream is = zipResource.getInputStream()) {
                all = is.readAllBytes();
            }
            try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(all))) {
                ZipEntry entry;
                while ((entry = zis.getNextEntry()) != null) {
                    out.put(
                            entry.getName(),
                            new String(zis.readAllBytes(), StandardCharsets.UTF_8));
                    zis.closeEntry();
                }
            }
            return out;
        }
    }

    @Nested
    @DisplayName("Error handling")
    class ErrorHandling {

        @Test
        @DisplayName("returns null when the processor throws during input generation")
        void processorThrowsOnGenerate_returnsNull() throws Exception {
            MultipartFile[] files = oneFile();
            when(processor.generateInputFiles(files)).thenThrow(new RuntimeException("boom"));

            ResponseEntity<Resource> response = controller.handleData(request(files, VALID_JSON));

            assertNull(response);
        }

        @Test
        @DisplayName("returns null when the pipeline run throws")
        void pipelineRunThrows_returnsNull() throws Exception {
            MultipartFile[] files = oneFile();
            when(processor.generateInputFiles(files))
                    .thenReturn(List.of(namedResource("input.pdf", "in".getBytes())));
            when(processor.runPipelineAgainstFiles(any(), any()))
                    .thenThrow(new RuntimeException("pipeline failed"));

            ResponseEntity<Resource> response = controller.handleData(request(files, VALID_JSON));

            assertNull(response);
        }

        @Test
        @DisplayName("invalid JSON config propagates as a parse exception")
        void invalidJson_throws() {
            MultipartFile[] files = oneFile();

            org.junit.jupiter.api.Assertions.assertThrows(
                    Exception.class, () -> controller.handleData(request(files, "not-valid-json")));

            verifyNoInteractions(postHogService);
        }
    }

    @Nested
    @DisplayName("JSON config parsing")
    class JsonParsing {

        @Test
        @DisplayName("multiple operation names are extracted in order for analytics")
        void multipleOperations_extractedInOrder() throws Exception {
            MultipartFile[] files = oneFile();
            String json =
                    "{\"name\":\"multi\",\"pipeline\":["
                            + "{\"operation\":\"/api/v1/misc/repair\",\"parameters\":{}},"
                            + "{\"operation\":\"/api/v1/security/sanitize-pdf\",\"parameters\":{}}]}";

            // Stop after analytics by returning no input files.
            when(processor.generateInputFiles(files)).thenReturn(null);

            controller.handleData(request(files, json));

            @SuppressWarnings("unchecked")
            ArgumentCaptor<Map<String, Object>> propsCaptor = ArgumentCaptor.forClass(Map.class);
            verify(postHogService).captureEvent(eq("pipeline_api_event"), propsCaptor.capture());

            assertEquals(
                    List.of("/api/v1/misc/repair", "/api/v1/security/sanitize-pdf"),
                    propsCaptor.getValue().get("operations"));
        }

        @Test
        @DisplayName("real ObjectMapper deserializes the pipeline config used by analytics")
        void objectMapperParsesConfig() {
            PipelineConfig config = objectMapper.readValue(VALID_JSON, PipelineConfig.class);
            assertEquals("test-pipeline", config.getName());
            assertEquals(1, config.getOperations().size());
            assertEquals("/api/v1/misc/repair", config.getOperations().get(0).getOperation());
        }
    }
}
