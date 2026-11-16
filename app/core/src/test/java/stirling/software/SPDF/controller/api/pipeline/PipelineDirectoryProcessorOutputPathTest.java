package stirling.software.SPDF.controller.api.pipeline;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.service.ApiDocService;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.service.PostHogService;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.common.util.FileReadinessChecker;

import tools.jackson.databind.ObjectMapper;

class PipelineDirectoryProcessorOutputPathTest {

    @TempDir Path tempDir;

    private Path finished;
    private Path jobDir;
    private PipelineDirectoryProcessor processor;

    @BeforeEach
    void setUp() {
        finished = tempDir.resolve("pipeline").resolve("finishedFolders").toAbsolutePath();
        Path watched = tempDir.resolve("pipeline").resolve("watchedFolders").toAbsolutePath();
        jobDir = watched.resolve("job");
        RuntimePathConfig paths = mock(RuntimePathConfig.class);
        when(paths.getPipelineWatchedFoldersPaths()).thenReturn(List.of(watched.toString()));
        when(paths.getPipelineFinishedFoldersPath()).thenReturn(finished.toString());
        processor =
                new PipelineDirectoryProcessor(
                        new ObjectMapper(),
                        mock(ApiDocService.class),
                        mock(ToolMetadataService.class),
                        mock(PipelineProcessor.class),
                        mock(PostHogService.class),
                        mock(FileReadinessChecker.class),
                        paths);
    }

    private Path outputFor(String outputDir) {
        PipelineConfig config = new PipelineConfig();
        config.setOutputDir(outputDir);
        return processor.determineOutputPath(config, jobDir);
    }

    @Test
    void keepsTheFinishedFolderForTheStandardPlaceholders() {
        assertEquals(finished.normalize(), outputFor("{outputFolder}"));
        assertEquals(finished.resolve("sub").normalize(), outputFor("{outputFolder}/sub"));
        assertEquals(
                Path.of(finished + "/" + jobDir.toString().replace("watchedFolders", ""))
                        .normalize(),
                outputFor("{outputFolder}/{folderName}"));
    }

    @Test
    void fallsBackToTheFinishedFolderForAnAbsolutePathOutsideIt() {
        assertEquals(
                finished.normalize(),
                outputFor(tempDir.resolve("configs").resolve("scripts").toString()));
    }

    @Test
    void fallsBackToTheFinishedFolderForARelativePathOutsideIt() {
        assertEquals(finished.normalize(), outputFor("configs/scripts/python"));
    }

    @Test
    void fallsBackToTheFinishedFolderForTraversalOutOfIt() {
        assertEquals(finished.normalize(), outputFor("{outputFolder}/../../configs"));
    }

    @Test
    void fallsBackToTheFinishedFolderWhenNoOutputDirIsGiven() {
        assertEquals(finished.normalize(), outputFor(null));
        assertEquals(finished.normalize(), outputFor(" "));
    }
}
