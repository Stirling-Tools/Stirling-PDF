package stirling.software.SPDF.controller.api.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import java.io.File;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineOperation;
import stirling.software.SPDF.service.ApiDocService;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.service.PostHogService;
import stirling.software.common.util.FileReadinessChecker;

import tools.jackson.databind.json.JsonMapper;

class PipelineDirectoryProcessorTest {

    private ApiDocService apiDocService;
    private FileReadinessChecker fileReadinessChecker;
    private PipelineDirectoryProcessor processor;

    @BeforeEach
    void setUp() {
        apiDocService = mock(ApiDocService.class);
        fileReadinessChecker = mock(FileReadinessChecker.class);
        RuntimePathConfig runtimePathConfig = mock(RuntimePathConfig.class);
        when(runtimePathConfig.getPipelineWatchedFoldersPaths()).thenReturn(List.of("watched"));
        when(runtimePathConfig.getPipelineFinishedFoldersPath()).thenReturn("finished");

        processor =
                new PipelineDirectoryProcessor(
                        JsonMapper.builder().build(),
                        apiDocService,
                        mock(PipelineProcessor.class),
                        mock(PostHogService.class),
                        fileReadinessChecker,
                        runtimePathConfig);
    }

    @Test
    void collectFilesForProcessingUsesConfiguredInputExtensionsWhenApiDocsReturnNull(
            @TempDir Path dir) throws Exception {
        Path jsonFile = dir.resolve("pipeline.json");
        Files.writeString(jsonFile, "{}");
        Path docxFile = dir.resolve("input.docx");
        Files.writeString(docxFile, "docx");
        Path pdfFile = dir.resolve("input.pdf");
        Files.writeString(pdfFile, "pdf");

        PipelineOperation operation = new PipelineOperation();
        operation.setOperation("/api/v1/convert/file/pdf");
        operation.setParameters(Map.of());

        PipelineConfig config = new PipelineConfig();
        config.setInputExtensions(List.of("doc", "docx", "odt", "rtf"));

        when(apiDocService.getExtensionTypes(false, "/api/v1/convert/file/pdf")).thenReturn(null);
        when(fileReadinessChecker.isReady(docxFile)).thenReturn(true);

        File[] files = collectFilesForProcessing(dir, jsonFile, operation, config);

        assertThat(files).extracting(File::getName).containsExactly("input.docx");
        verify(fileReadinessChecker).isReady(docxFile);
        verify(fileReadinessChecker, never()).isReady(pdfFile);
    }

    @Test
    void collectFilesForProcessingAllowsAllFilesWhenApiDocsAndConfigHaveNoExtensions(
            @TempDir Path dir) throws Exception {
        Path jsonFile = dir.resolve("pipeline.json");
        Files.writeString(jsonFile, "{}");
        Path docxFile = dir.resolve("input.docx");
        Files.writeString(docxFile, "docx");
        Path pdfFile = dir.resolve("input.pdf");
        Files.writeString(pdfFile, "pdf");

        PipelineOperation operation = new PipelineOperation();
        operation.setOperation("/api/v1/convert/file/pdf");
        operation.setParameters(Map.of());

        PipelineConfig config = new PipelineConfig();

        when(apiDocService.getExtensionTypes(false, "/api/v1/convert/file/pdf")).thenReturn(null);
        when(fileReadinessChecker.isReady(docxFile)).thenReturn(true);
        when(fileReadinessChecker.isReady(pdfFile)).thenReturn(true);

        File[] files = collectFilesForProcessing(dir, jsonFile, operation, config);

        assertThat(files)
                .extracting(File::getName)
                .containsExactlyInAnyOrder("input.docx", "input.pdf");
    }

    private File[] collectFilesForProcessing(
            Path dir, Path jsonFile, PipelineOperation operation, PipelineConfig config)
            throws Exception {
        Method method =
                PipelineDirectoryProcessor.class.getDeclaredMethod(
                        "collectFilesForProcessing",
                        Path.class,
                        Path.class,
                        PipelineOperation.class,
                        PipelineConfig.class);
        method.setAccessible(true);
        return (File[]) method.invoke(processor, dir, jsonFile, operation, config);
    }
}
