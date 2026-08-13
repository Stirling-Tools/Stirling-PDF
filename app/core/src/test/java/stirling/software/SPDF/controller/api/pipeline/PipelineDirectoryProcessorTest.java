package stirling.software.SPDF.controller.api.pipeline;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.service.ApiDocService;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.service.PostHogService;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.common.util.FileReadinessChecker;

import tools.jackson.databind.ObjectMapper;

/**
 * Unit tests for the path containment rules in {@link PipelineDirectoryProcessor}: relative output
 * directories must stay under the finished folders base, and files collected from a watched folder
 * must not resolve outside it via symlinks.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PipelineDirectoryProcessorTest {

    @Mock private ApiDocService apiDocService;

    @Mock private ToolMetadataService toolMetadataService;

    @Mock private PipelineProcessor processor;

    @Mock private PostHogService postHogService;

    @Mock private FileReadinessChecker fileReadinessChecker;

    @Mock private RuntimePathConfig runtimePathConfig;

    @TempDir Path tempDir;

    private Path watchedRoot;
    private Path finishedFolders;
    private PipelineDirectoryProcessor directoryProcessor;

    @BeforeEach
    void setUp() throws IOException {
        watchedRoot = Files.createDirectories(tempDir.resolve("watched"));
        finishedFolders = Files.createDirectories(tempDir.resolve("finished"));
        when(runtimePathConfig.getPipelineWatchedFoldersPaths())
                .thenReturn(List.of(watchedRoot.toString()));
        when(runtimePathConfig.getPipelineFinishedFoldersPath())
                .thenReturn(finishedFolders.toString());
        directoryProcessor =
                new PipelineDirectoryProcessor(
                        new ObjectMapper(),
                        apiDocService,
                        toolMetadataService,
                        processor,
                        postHogService,
                        fileReadinessChecker,
                        runtimePathConfig);
    }

    private PipelineConfig configWithOutputDir(String outputDir) {
        PipelineConfig config = new PipelineConfig();
        config.setOutputDir(outputDir);
        return config;
    }

    /** Symlink creation needs elevated rights on Windows; skip rather than fail there. */
    private Path linkOrSkip(Path link, Path target) {
        try {
            return Files.createSymbolicLink(link, target);
        } catch (IOException | UnsupportedOperationException e) {
            assumeTrue(false, "Symlinks unsupported in this environment: " + e.getMessage());
            return null;
        }
    }

    @Nested
    @DisplayName("determineOutputPath")
    class DetermineOutputPath {

        @Test
        @DisplayName("keeps an explicitly configured absolute path untouched")
        void absolutePathIsUnchanged() {
            Path absolute = tempDir.resolve("elsewhere");
            PipelineConfig config = configWithOutputDir(absolute.toString());

            assertEquals(
                    absolute,
                    directoryProcessor.determineOutputPath(config, watchedRoot.resolve("job")));
        }

        @Test
        @DisplayName("expands {outputFolder} to the finished folders base")
        void outputFolderPlaceholderResolvesToBase() {
            PipelineConfig config = configWithOutputDir("{outputFolder}");

            assertEquals(
                    finishedFolders,
                    directoryProcessor.determineOutputPath(config, watchedRoot.resolve("job")));
        }

        @Test
        @DisplayName("anchors a relative path under the finished folders base")
        void relativePathIsAnchoredUnderBase() {
            PipelineConfig config = configWithOutputDir("reports");

            assertEquals(
                    finishedFolders.resolve("reports"),
                    directoryProcessor.determineOutputPath(config, watchedRoot.resolve("job")));
        }

        @Test
        @DisplayName("falls back to the base when a relative path traverses out of it")
        void traversalFallsBackToBase() {
            PipelineConfig config = configWithOutputDir("../../tmp/evil");

            assertEquals(
                    finishedFolders,
                    directoryProcessor.determineOutputPath(config, watchedRoot.resolve("job")));
        }

        @Test
        @DisplayName("allows a relative path that dips out and back inside the base")
        void relativePathStayingInsideBaseIsKept() {
            PipelineConfig config = configWithOutputDir("nested/../reports");

            assertEquals(
                    finishedFolders.resolve("reports"),
                    directoryProcessor.determineOutputPath(config, watchedRoot.resolve("job")));
        }
    }

    @Nested
    @DisplayName("isInsideWatchedRoot")
    class IsInsideWatchedRoot {

        @Test
        @DisplayName("accepts a plain file inside the watched folder")
        void acceptsPlainFile() throws IOException {
            Path dir = Files.createDirectories(watchedRoot.resolve("job"));
            Path file = Files.createFile(dir.resolve("input.pdf"));

            assertTrue(directoryProcessor.isInsideWatchedRoot(file, dir, watchedRoot));
        }

        @Test
        @DisplayName("accepts a symlink whose target is still inside the watched root")
        void acceptsSymlinkInsideWatchedRoot() throws IOException {
            Path dir = Files.createDirectories(watchedRoot.resolve("job"));
            Path target = Files.createFile(watchedRoot.resolve("shared.pdf"));
            Path link = linkOrSkip(dir.resolve("input.pdf"), target);

            assertTrue(directoryProcessor.isInsideWatchedRoot(link, dir, watchedRoot));
        }

        @Test
        @DisplayName("accepts files under a watched subfolder symlinked to a mounted share")
        void acceptsFilesUnderSymlinkedSubfolder() throws IOException {
            Path share = Files.createDirectories(tempDir.resolve("mounted-share"));
            Path file = Files.createFile(share.resolve("input.pdf"));
            Path dir = linkOrSkip(watchedRoot.resolve("job"), share);
            Path viaLink = dir.resolve(file.getFileName());

            assertTrue(directoryProcessor.isInsideWatchedRoot(viaLink, dir, watchedRoot));
        }

        @Test
        @DisplayName("rejects a symlink pointing outside the watched root")
        void rejectsEscapingSymlink() throws IOException {
            Path dir = Files.createDirectories(watchedRoot.resolve("job"));
            Path secret = Files.createFile(tempDir.resolve("secret.pdf"));
            Path link = linkOrSkip(dir.resolve("input.pdf"), secret);

            assertFalse(directoryProcessor.isInsideWatchedRoot(link, dir, watchedRoot));
        }

        @Test
        @DisplayName("rejects a broken symlink without throwing")
        void rejectsBrokenSymlink() throws IOException {
            Path dir = Files.createDirectories(watchedRoot.resolve("job"));
            Path link = linkOrSkip(dir.resolve("input.pdf"), tempDir.resolve("missing.pdf"));

            assertFalse(directoryProcessor.isInsideWatchedRoot(link, dir, watchedRoot));
        }
    }
}
