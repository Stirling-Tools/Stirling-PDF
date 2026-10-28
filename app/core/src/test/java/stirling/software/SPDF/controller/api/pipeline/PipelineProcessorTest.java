package stirling.software.SPDF.controller.api.pipeline;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineOperation;
import stirling.software.SPDF.model.PipelineResult;
import stirling.software.SPDF.service.ApiDocService;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.common.util.PipelineLimits;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class PipelineProcessorTest {

    @Mock ApiDocService apiDocService;

    @Mock ToolMetadataService toolMetadataService;

    @Mock InternalApiClient internalApiClient;

    @Mock TempFileManager tempFileManager;

    final ApplicationProperties properties = new ApplicationProperties();

    PipelineProcessor pipelineProcessor;

    @BeforeEach
    void setUp() throws Exception {
        pipelineProcessor =
                new PipelineProcessor(
                        apiDocService,
                        toolMetadataService,
                        internalApiClient,
                        tempFileManager,
                        properties);
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

        when(toolMetadataService.isMultiInput("/api/v1/filter/filter-page-count"))
                .thenReturn(false);
        when(toolMetadataService.getExtensionTypes(false, "/api/v1/filter/filter-page-count"))
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

        when(toolMetadataService.isMultiInput(anyString())).thenReturn(false);
        when(toolMetadataService.getExtensionTypes(anyBoolean(), anyString()))
                .thenReturn(List.of("pdf"));
        when(apiDocService.isValidOperation(anyString(), anyMap())).thenReturn(true);

        when(internalApiClient.post(anyString(), any()))
                .thenReturn(new ResponseEntity<>(outputResource, HttpStatus.OK));

        PipelineResult result = pipelineProcessor.runPipelineAgainstFiles(files, config);

        verify(internalApiClient).post(anyString(), any());

        assertFalse(result.isHasErrors());

        Files.deleteIfExists(tempPath);
    }

    @Test
    void failingStepReleasesEarlierStepOutputs() throws Exception {
        PipelineOperation first = new PipelineOperation();
        first.setOperation("/api/v1/misc/compress");
        first.setParameters(Map.of());
        PipelineOperation second = new PipelineOperation();
        second.setOperation("/api/v1/misc/repair");
        second.setParameters(Map.of());
        PipelineConfig config = new PipelineConfig();
        config.setOperations(List.of(first, second));

        Path tempPath = Files.createTempFile("test-output", ".pdf");
        TempFile firstOutput = mock(TempFile.class);
        when(firstOutput.getFile()).thenReturn(tempPath.toFile());
        Resource firstResource = new InternalApiClient.TempFileResource(firstOutput, "test.pdf");

        when(toolMetadataService.isMultiInput(anyString())).thenReturn(false);
        when(toolMetadataService.getExtensionTypes(anyBoolean(), anyString()))
                .thenReturn(List.of("ALL"));
        when(apiDocService.isValidOperation(anyString(), anyMap())).thenReturn(true);

        when(internalApiClient.post(eq("/api/v1/misc/compress"), any()))
                .thenReturn(new ResponseEntity<>(firstResource, HttpStatus.OK));
        when(internalApiClient.post(eq("/api/v1/misc/repair"), any()))
                .thenThrow(new IllegalStateException("step failed"));

        assertThrows(
                IllegalStateException.class,
                () ->
                        pipelineProcessor.runPipelineAgainstFiles(
                                List.of(new MyFileByteArrayResource()), config));

        verify(firstOutput, atLeastOnce()).close();

        Files.deleteIfExists(tempPath);
    }

    @Test
    void pipelineWithMoreOperationsThanTheLimitIsRejected() {
        properties.getPolicies().setMaxSteps(2);
        PipelineConfig config = new PipelineConfig();
        config.setOperations(Collections.nCopies(3, operation("/api/v1/misc/compress")));

        assertThrows(
                PipelineLimits.LimitExceededException.class,
                () ->
                        pipelineProcessor.runPipelineAgainstFiles(
                                List.of(new MyFileByteArrayResource()), config));

        verifyNoInteractions(internalApiClient);
    }

    @Test
    void chainedZipOperationsStopAtTheFileLimitAndReleaseTempFiles(@TempDir Path tempDir)
            throws Exception {
        properties.getPolicies().setMaxFilesPerStep(50);
        String split = "/api/v1/general/split-pdf-by-sections";
        PipelineConfig config = new PipelineConfig();
        config.setOperations(List.of(operation(split), operation(split)));
        stubAnyPdfOperation();
        stubTempFilesIn(tempDir);
        byte[] zip = zipOfPdfs(20);
        when(internalApiClient.post(anyString(), any()))
                .thenAnswer(inv -> ResponseEntity.ok(tempFileResource(zip, "out.zip")));

        assertThrows(
                PipelineLimits.LimitExceededException.class,
                () ->
                        pipelineProcessor.runPipelineAgainstFiles(
                                List.of(new MyFileByteArrayResource()), config));

        // One call makes 20 files; the second operation passes 50 on its third call.
        verify(internalApiClient, times(4)).post(anyString(), any());
        try (Stream<Path> left = Files.list(tempDir)) {
            assertEquals(0, left.count());
        }
    }

    @Test
    void tempFilesOfAnOperationAreReleasedOnceTheNextHasRun(@TempDir Path tempDir)
            throws Exception {
        PipelineConfig config = new PipelineConfig();
        config.setOperations(
                List.of(
                        operation("/api/v1/general/rotate-pdf"),
                        operation("/api/v1/misc/compress")));
        stubAnyPdfOperation();
        stubTempFilesIn(tempDir);
        InternalApiClient.TempFileResource rotated =
                tempFileResource("rotated".getBytes(), "a.pdf");
        InternalApiClient.TempFileResource compressed =
                tempFileResource("compressed".getBytes(), "a.pdf");
        when(internalApiClient.post(eq("/api/v1/general/rotate-pdf"), any()))
                .thenReturn(attachment(rotated));
        when(internalApiClient.post(eq("/api/v1/misc/compress"), any()))
                .thenReturn(attachment(compressed));

        try (PipelineResult result =
                pipelineProcessor.runPipelineAgainstFiles(
                        List.of(new MyFileByteArrayResource()), config)) {
            assertFalse(rotated.getTempFile().exists());
            assertEquals(
                    "compressed",
                    result.getOutputFiles().get(0).getContentAsString(StandardCharsets.UTF_8));
        }
        assertFalse(compressed.getTempFile().exists());
    }

    @Test
    void uploadsOutliveTheRunUntilTheCallerDeletesThem(@TempDir Path tempDir) throws Exception {
        PipelineConfig config = new PipelineConfig();
        config.setOperations(List.of(operation("/api/v1/misc/compress")));
        stubAnyPdfOperation();
        stubTempFilesIn(tempDir);
        when(internalApiClient.post(anyString(), any()))
                .thenAnswer(inv -> attachment(tempFileResource("out".getBytes(), "a.pdf")));

        List<Resource> uploads =
                pipelineProcessor.generateInputFiles(
                        new MultipartFile[] {
                            new MockMultipartFile("fileInput", "a.pdf", null, "in".getBytes())
                        });
        InternalApiClient.TempFileResource upload =
                (InternalApiClient.TempFileResource) uploads.get(0);
        assertEquals("a.pdf", upload.getFilename());

        try (PipelineResult result = pipelineProcessor.runPipelineAgainstFiles(uploads, config)) {
            assertEquals(
                    "out",
                    result.getOutputFiles().get(0).getContentAsString(StandardCharsets.UTF_8));
        }
        assertTrue(upload.getTempFile().exists());

        pipelineProcessor.deleteInputFiles(uploads);

        try (Stream<Path> left = Files.list(tempDir)) {
            assertEquals(0, left.count());
        }
    }

    private static PipelineOperation operation(String path) {
        PipelineOperation op = new PipelineOperation();
        op.setOperation(path);
        op.setParameters(Map.of());
        return op;
    }

    private void stubAnyPdfOperation() {
        when(toolMetadataService.isMultiInput(anyString())).thenReturn(false);
        when(toolMetadataService.getExtensionTypes(anyBoolean(), anyString()))
                .thenReturn(List.of("pdf"));
        when(apiDocService.isValidOperation(anyString(), anyMap())).thenReturn(true);
    }

    private void stubTempFilesIn(Path dir) throws Exception {
        lenient()
                .when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(inv -> Files.createTempFile(dir, "test", inv.getArgument(0)).toFile());
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(inv -> new TempFile(tempFileManager, inv.getArgument(0)));
        lenient()
                .when(tempFileManager.deleteTempFile(any(File.class)))
                .thenAnswer(inv -> inv.<File>getArgument(0).delete());
    }

    private InternalApiClient.TempFileResource tempFileResource(byte[] content, String filename)
            throws Exception {
        TempFile tempFile = new TempFile(tempFileManager, ".tmp");
        Files.write(tempFile.getPath(), content);
        return new InternalApiClient.TempFileResource(tempFile, filename);
    }

    private static ResponseEntity<Resource> attachment(Resource body) {
        return ResponseEntity.ok()
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + body.getFilename() + "\"")
                .body(body);
    }

    private static byte[] zipOfPdfs(int entries) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            for (int i = 0; i < entries; i++) {
                zip.putNextEntry(new ZipEntry("section_" + i + ".pdf"));
                zip.write('x');
                zip.closeEntry();
            }
        }
        return bytes.toByteArray();
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
