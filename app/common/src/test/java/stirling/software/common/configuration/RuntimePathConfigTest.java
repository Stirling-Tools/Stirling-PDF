package stirling.software.common.configuration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.CustomPaths.Operations;
import stirling.software.common.model.ApplicationProperties.CustomPaths.Pipeline;

/**
 * Unit tests for {@link RuntimePathConfig}. All of the resolution logic lives in the constructor,
 * so each test builds a real {@link ApplicationProperties} (a plain @Data POJO with sensible
 * defaults), constructs the config, and asserts on the exposed getters.
 */
class RuntimePathConfigTest {

    /** The base path the production code derives from {@link InstallationPathConfig#getPath()}. */
    private static final String BASE_PATH = InstallationPathConfig.getPath();

    private static ApplicationProperties newProperties() {
        return new ApplicationProperties();
    }

    private static RuntimePathConfig build(ApplicationProperties properties) {
        return new RuntimePathConfig(properties);
    }

    @Nested
    @DisplayName("Pipeline directory resolution")
    class PipelinePaths {

        @Test
        @DisplayName("Defaults to <basePath>/pipeline and derived sub-folders")
        void defaultPipelinePaths() {
            RuntimePathConfig config = build(newProperties());

            String expectedPipeline = Path.of(BASE_PATH, "pipeline").toString();
            assertEquals(expectedPipeline, config.getPipelinePath());
            // Watched folders are resolved to an absolute, normalized path by the production code.
            assertEquals(
                    Path.of(expectedPipeline, "watchedFolders")
                            .toAbsolutePath()
                            .normalize()
                            .toString(),
                    config.getPipelineWatchedFoldersPath());
            assertEquals(
                    Path.of(expectedPipeline, "finishedFolders").toString(),
                    config.getPipelineFinishedFoldersPath());
            assertEquals(
                    Path.of(expectedPipeline, "defaultWebUIConfigs").toString(),
                    config.getPipelineDefaultWebUiConfigs());
        }

        @Test
        @DisplayName("Custom pipelineDir overrides the default pipeline path")
        void customPipelineDir() {
            ApplicationProperties properties = newProperties();
            Pipeline pipeline = properties.getSystem().getCustomPaths().getPipeline();
            pipeline.setPipelineDir("/custom/pipeline");

            RuntimePathConfig config = build(properties);

            assertEquals("/custom/pipeline", config.getPipelinePath());
            // Sub-folders are derived from the (already-resolved) custom pipeline path.
            assertEquals(
                    Path.of("/custom/pipeline", "finishedFolders").toString(),
                    config.getPipelineFinishedFoldersPath());
            assertEquals(
                    Path.of("/custom/pipeline", "defaultWebUIConfigs").toString(),
                    config.getPipelineDefaultWebUiConfigs());
        }

        @Test
        @DisplayName("Blank pipelineDir falls back to the default")
        void blankPipelineDirFallsBackToDefault() {
            ApplicationProperties properties = newProperties();
            properties.getSystem().getCustomPaths().getPipeline().setPipelineDir("   ");

            RuntimePathConfig config = build(properties);

            assertEquals(Path.of(BASE_PATH, "pipeline").toString(), config.getPipelinePath());
        }

        @Test
        @DisplayName("Custom finished and webUI configs dirs override defaults")
        void customFinishedAndWebUiDirs() {
            ApplicationProperties properties = newProperties();
            Pipeline pipeline = properties.getSystem().getCustomPaths().getPipeline();
            pipeline.setFinishedFoldersDir("/custom/finished");
            pipeline.setWebUIConfigsDir("/custom/webui");

            RuntimePathConfig config = build(properties);

            assertEquals("/custom/finished", config.getPipelineFinishedFoldersPath());
            assertEquals("/custom/webui", config.getPipelineDefaultWebUiConfigs());
        }
    }

    @Nested
    @DisplayName("Watched folder resolution")
    class WatchedFolders {

        @Test
        @DisplayName("Default watched folder is <pipeline>/watchedFolders and list has one entry")
        void defaultWatchedFolder() {
            RuntimePathConfig config = build(newProperties());

            // Watched folders are resolved to an absolute, normalized path by the production code.
            String expected =
                    Path.of(Path.of(BASE_PATH, "pipeline").toString(), "watchedFolders")
                            .toAbsolutePath()
                            .normalize()
                            .toString();
            assertEquals(expected, config.getPipelineWatchedFoldersPath());
            assertEquals(1, config.getPipelineWatchedFoldersPaths().size());
            assertEquals(expected, config.getPipelineWatchedFoldersPaths().get(0));
        }

        @Test
        @DisplayName("Legacy single watchedFoldersDir is used when no list is provided")
        void legacyWatchedFolder() {
            ApplicationProperties properties = newProperties();
            properties
                    .getSystem()
                    .getCustomPaths()
                    .getPipeline()
                    .setWatchedFoldersDir("relativeWatched");

            RuntimePathConfig config = build(properties);

            // Legacy paths are normalized to absolute.
            String expected = Path.of("relativeWatched").toAbsolutePath().normalize().toString();
            assertEquals(1, config.getPipelineWatchedFoldersPaths().size());
            assertEquals(expected, config.getPipelineWatchedFoldersPath());
        }

        @Test
        @DisplayName("New list config takes precedence over the legacy single dir")
        void listTakesPrecedenceOverLegacy() {
            ApplicationProperties properties = newProperties();
            Pipeline pipeline = properties.getSystem().getCustomPaths().getPipeline();
            pipeline.setWatchedFoldersDir("legacyDir");
            pipeline.setWatchedFoldersDirs(new ArrayList<>(Arrays.asList("listDirA", "listDirB")));

            RuntimePathConfig config = build(properties);

            List<String> paths = config.getPipelineWatchedFoldersPaths();
            assertEquals(2, paths.size());
            assertEquals(Path.of("listDirA").toAbsolutePath().normalize().toString(), paths.get(0));
            assertEquals(Path.of("listDirB").toAbsolutePath().normalize().toString(), paths.get(1));
            // The legacy value must NOT appear when the list is present.
            assertFalse(
                    paths.contains(Path.of("legacyDir").toAbsolutePath().normalize().toString()));
        }

        @Test
        @DisplayName("Duplicate paths in the list are de-duplicated after normalization")
        void duplicatePathsAreDeduplicated() {
            ApplicationProperties properties = newProperties();
            properties
                    .getSystem()
                    .getCustomPaths()
                    .getPipeline()
                    .setWatchedFoldersDirs(
                            new ArrayList<>(Arrays.asList("dupDir", "dupDir", "otherDir")));

            RuntimePathConfig config = build(properties);

            List<String> paths = config.getPipelineWatchedFoldersPaths();
            assertEquals(2, paths.size());
            assertEquals(Path.of("dupDir").toAbsolutePath().normalize().toString(), paths.get(0));
            assertEquals(Path.of("otherDir").toAbsolutePath().normalize().toString(), paths.get(1));
        }

        @Test
        @DisplayName("Blank and whitespace-only list entries are sanitized out")
        void blankListEntriesAreFiltered() {
            ApplicationProperties properties = newProperties();
            properties
                    .getSystem()
                    .getCustomPaths()
                    .getPipeline()
                    .setWatchedFoldersDirs(
                            new ArrayList<>(Arrays.asList("  ", "", "validDir", "   ")));

            RuntimePathConfig config = build(properties);

            List<String> paths = config.getPipelineWatchedFoldersPaths();
            assertEquals(1, paths.size());
            assertEquals(Path.of("validDir").toAbsolutePath().normalize().toString(), paths.get(0));
        }

        @Test
        @DisplayName("List entries are trimmed before resolution")
        void listEntriesAreTrimmed() {
            ApplicationProperties properties = newProperties();
            properties
                    .getSystem()
                    .getCustomPaths()
                    .getPipeline()
                    .setWatchedFoldersDirs(new ArrayList<>(Arrays.asList("  spacedDir  ")));

            RuntimePathConfig config = build(properties);

            assertEquals(
                    Path.of("spacedDir").toAbsolutePath().normalize().toString(),
                    config.getPipelineWatchedFoldersPath());
        }

        @Test
        @DisplayName("An all-blank list falls back to the legacy dir, then default")
        void allBlankListFallsBackToDefault() {
            ApplicationProperties properties = newProperties();
            properties
                    .getSystem()
                    .getCustomPaths()
                    .getPipeline()
                    .setWatchedFoldersDirs(new ArrayList<>(Arrays.asList("", "   ")));

            RuntimePathConfig config = build(properties);

            // sanitizePathList strips everything -> empty -> falls through to default watched
            // folder.
            // The default is also resolved to an absolute, normalized path by the production code.
            String expectedDefault =
                    Path.of(Path.of(BASE_PATH, "pipeline").toString(), "watchedFolders")
                            .toAbsolutePath()
                            .normalize()
                            .toString();
            assertEquals(1, config.getPipelineWatchedFoldersPaths().size());
            assertEquals(expectedDefault, config.getPipelineWatchedFoldersPath());
        }

        @Test
        @DisplayName("First watched folder path is always exposed via the singular getter")
        void singularGetterReturnsFirstEntry() {
            ApplicationProperties properties = newProperties();
            properties
                    .getSystem()
                    .getCustomPaths()
                    .getPipeline()
                    .setWatchedFoldersDirs(new ArrayList<>(Arrays.asList("firstDir", "secondDir")));

            RuntimePathConfig config = build(properties);

            assertEquals(
                    config.getPipelineWatchedFoldersPaths().get(0),
                    config.getPipelineWatchedFoldersPath());
            assertEquals(
                    Path.of("firstDir").toAbsolutePath().normalize().toString(),
                    config.getPipelineWatchedFoldersPath());
        }
    }

    @Nested
    @DisplayName("Operation tool path resolution")
    class OperationPaths {

        @Test
        @DisplayName("Defaults to bare command names when not running in Docker")
        void defaultOperationPaths() {
            // The test host has no /.dockerenv, so the non-docker defaults apply.
            assertEquals("ocrmypdf", build(newProperties()).getOcrMyPdfPath());
        }

        @Test
        @DisplayName("A custom operation path overrides the default")
        void customOperationPaths() {
            ApplicationProperties properties = newProperties();
            Operations operations = properties.getSystem().getCustomPaths().getOperations();
            operations.setOcrmypdf("/opt/custom/ocrmypdf");

            assertEquals("/opt/custom/ocrmypdf", build(properties).getOcrMyPdfPath());
        }

        @Test
        @DisplayName("Blank custom operation path falls back to the default")
        void blankOperationPathFallsBack() {
            ApplicationProperties properties = newProperties();
            properties.getSystem().getCustomPaths().getOperations().setOcrmypdf("   ");

            assertEquals("ocrmypdf", build(properties).getOcrMyPdfPath());
        }
    }

    @Nested
    @DisplayName("Tesseract data path resolution")
    class TessdataPath {

        @Test
        @DisplayName("Explicit tessdataDir config wins over env var and default")
        void configuredTessdataDirWins() {
            ApplicationProperties properties = newProperties();
            properties.getSystem().setTessdataDir("/my/tessdata");

            RuntimePathConfig config = build(properties);

            // Config setting has the highest priority regardless of TESSDATA_PREFIX env state.
            assertEquals("/my/tessdata", config.getTessDataPath());
        }

        @Test
        @DisplayName("tessDataPath is never null even with no config")
        void tessDataPathNeverNull() {
            RuntimePathConfig config = build(newProperties());

            // With no config setting, the value comes from TESSDATA_PREFIX or the hard default,
            // either of which is non-null.
            assertNotNull(config.getTessDataPath());
            assertFalse(config.getTessDataPath().isEmpty());
        }
    }

    @Nested
    @DisplayName("General contract")
    class GeneralContract {

        @Test
        @DisplayName("getProperties returns the same instance passed to the constructor")
        void propertiesAccessorReturnsSameInstance() {
            ApplicationProperties properties = newProperties();

            RuntimePathConfig config = build(properties);

            assertSame(properties, config.getProperties());
        }

        @Test
        @DisplayName("basePath matches InstallationPathConfig.getPath()")
        void basePathMatchesInstallationPath() {
            RuntimePathConfig config = build(newProperties());

            assertEquals(BASE_PATH, config.getBasePath());
        }

        @Test
        @DisplayName("All resolved path getters are non-null")
        void allPathsNonNull() {
            RuntimePathConfig config = build(newProperties());

            assertNotNull(config.getPipelinePath());
            assertNotNull(config.getPipelineWatchedFoldersPath());
            assertNotNull(config.getPipelineWatchedFoldersPaths());
            assertNotNull(config.getPipelineFinishedFoldersPath());
            assertNotNull(config.getPipelineDefaultWebUiConfigs());
            assertNotNull(config.getOcrMyPdfPath());
            assertNotNull(config.getTessDataPath());
        }
    }
}
