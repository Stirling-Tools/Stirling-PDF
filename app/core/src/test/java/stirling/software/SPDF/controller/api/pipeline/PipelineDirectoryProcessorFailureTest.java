package stirling.software.SPDF.controller.api.pipeline;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.AbstractResource;
import org.springframework.core.io.FileSystemResource;

import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineResult;
import stirling.software.SPDF.service.ApiDocService;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.service.PostHogService;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.common.util.FileReadinessChecker;
import stirling.software.common.util.PipelineLimits;
import stirling.software.common.util.TempFile;

import tools.jackson.databind.ObjectMapper;

class PipelineDirectoryProcessorFailureTest {

    @TempDir Path tempDir;

    private final PipelineProcessor pipelineProcessor = mock(PipelineProcessor.class);
    private Path jobDir;
    private Path processingDir;
    private Path queued;
    private PipelineDirectoryProcessor processor;

    @BeforeEach
    void setUp() throws Exception {
        Path watched = tempDir.resolve("watchedFolders");
        jobDir = watched.resolve("job");
        processingDir = Files.createDirectories(jobDir.resolve("processing"));
        queued = Files.writeString(processingDir.resolve("a.pdf"), "pdf");
        RuntimePathConfig paths = mock(RuntimePathConfig.class);
        when(paths.getPipelineWatchedFoldersPaths()).thenReturn(List.of(watched.toString()));
        when(paths.getPipelineFinishedFoldersPath())
                .thenReturn(tempDir.resolve("finishedFolders").toString());
        processor =
                new PipelineDirectoryProcessor(
                        new ObjectMapper(),
                        mock(ApiDocService.class),
                        mock(ToolMetadataService.class),
                        pipelineProcessor,
                        mock(PostHogService.class),
                        mock(FileReadinessChecker.class),
                        paths);
        when(pipelineProcessor.generateInputFiles(any(File[].class)))
                .thenReturn(List.of(new FileSystemResource(queued)));
    }

    @Test
    void aRunThatFailsMovesItsFilesToTheErrorFolder() throws Exception {
        when(pipelineProcessor.runPipelineAgainstFiles(any(), any()))
                .thenThrow(new PipelineLimits.LimitExceededException("too many steps"));

        processor.runPipelineAgainstFiles(
                List.of(queued.toFile()), config(), jobDir, processingDir);

        assertFalse(Files.exists(queued));
        assertTrue(Files.exists(jobDir.resolve("error").resolve("a.pdf")));
    }

    @Test
    void outputsAreDeletedWhenTheyCannotBeWritten() throws Exception {
        TempFile output = mock(TempFile.class);
        PipelineResult result = new PipelineResult();
        result.addTempFile(output);
        result.setOutputFiles(List.of(new UnreadableResource()));
        when(pipelineProcessor.runPipelineAgainstFiles(any(), any())).thenReturn(result);

        processor.runPipelineAgainstFiles(
                List.of(queued.toFile()), config(), jobDir, processingDir);

        verify(output).close();
        assertTrue(Files.exists(jobDir.resolve("error").resolve("a.pdf")));
    }

    private static PipelineConfig config() {
        PipelineConfig config = new PipelineConfig();
        config.setName("job");
        config.setOutputDir("{outputFolder}");
        config.setOutputPattern("{filename}");
        return config;
    }

    private static class UnreadableResource extends AbstractResource {
        @Override
        public String getFilename() {
            return "out.pdf";
        }

        @Override
        public String getDescription() {
            return "unreadable";
        }

        @Override
        public InputStream getInputStream() throws IOException {
            throw new IOException("unreadable");
        }
    }
}
