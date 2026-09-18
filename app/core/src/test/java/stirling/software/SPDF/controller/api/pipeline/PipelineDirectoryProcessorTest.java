package stirling.software.SPDF.controller.api.pipeline;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.ObjectProvider;

import stirling.software.SPDF.service.ApiDocService;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.service.MigratedWatchedFolders;
import stirling.software.common.service.PostHogService;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.common.util.FileReadinessChecker;

import tools.jackson.databind.ObjectMapper;

/**
 * Tests the guards around the legacy watched-folder scan: it stands down for folders converted into
 * policies, waits for startup, and never treats Stirling's own hidden state as a pipeline folder.
 */
class PipelineDirectoryProcessorTest {

    @TempDir Path watchedRoot;

    private final Set<Path> migrated = new HashSet<>();
    private PipelineDirectoryProcessor processor;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        RuntimePathConfig runtimePathConfig = mock(RuntimePathConfig.class);
        when(runtimePathConfig.getPipelineWatchedFoldersPaths())
                .thenReturn(List.of(watchedRoot.toString()));
        when(runtimePathConfig.getPipelineFinishedFoldersPath())
                .thenReturn(watchedRoot.resolveSibling("finished").toString());
        ObjectProvider<MigratedWatchedFolders> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable())
                .thenReturn(directory -> migrated.contains(directory.toAbsolutePath().normalize()));
        processor =
                new PipelineDirectoryProcessor(
                        mock(ObjectMapper.class),
                        mock(ApiDocService.class),
                        mock(ToolMetadataService.class),
                        mock(PipelineProcessor.class),
                        mock(PostHogService.class),
                        mock(FileReadinessChecker.class),
                        provider,
                        runtimePathConfig);
    }

    @Test
    void scansAWatchedFolderOnceStartupHasFinished() throws IOException {
        Path folder = folder("invoices");

        processor.onApplicationReady();
        processor.scanFolders();

        assertTrue(wasScanned(folder));
    }

    @Test
    void waitsForStartupBeforeScanning() throws IOException {
        Path folder = folder("invoices");

        processor.scanFolders();

        // A folder about to be converted must not have a file claimed out of it first.
        assertFalse(wasScanned(folder));
    }

    @Test
    void standsDownForAFolderConvertedIntoAPolicy() throws IOException {
        Path folder = folder("invoices");
        migrated.add(folder.toAbsolutePath().normalize());

        processor.onApplicationReady();
        processor.scanFolders();

        // Both the policy engine and this scanner running the folder double-processes every file.
        assertFalse(wasScanned(folder));
    }

    @Test
    void neverTreatsHiddenStateAsAPipelineFolder() throws IOException {
        Path archive = folder(".stirling/migrated");

        processor.onApplicationReady();
        processor.scanFolders();

        assertFalse(wasScanned(archive));
        assertFalse(wasScanned(archive.getParent()));
    }

    private Path folder(String relative) throws IOException {
        Path folder = watchedRoot.resolve(relative);
        Files.createDirectories(folder);
        return folder;
    }

    /** The scan creates a staging directory in every folder it takes on. */
    private static boolean wasScanned(Path folder) {
        return Files.isDirectory(folder.resolve("processing"));
    }
}
