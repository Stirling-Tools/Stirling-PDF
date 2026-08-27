package stirling.software.common.configuration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
import stirling.software.common.model.ApplicationProperties.ProcessExecutor.UnoServerEndpoint;

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
            RuntimePathConfig config = build(newProperties());

            assertEquals("weasyprint", config.getWeasyPrintPath());
            assertEquals("unoconvert", config.getUnoConvertPath());
            assertEquals("ebook-convert", config.getCalibrePath());
            assertEquals("ocrmypdf", config.getOcrMyPdfPath());
            assertEquals("soffice", config.getSOfficePath());
        }

        @Test
        @DisplayName("Custom operation paths override the defaults")
        void customOperationPaths() {
            ApplicationProperties properties = newProperties();
            Operations operations = properties.getSystem().getCustomPaths().getOperations();
            operations.setWeasyprint("/opt/custom/weasyprint");
            operations.setUnoconvert("/opt/custom/unoconvert");
            operations.setCalibre("/opt/custom/ebook-convert");
            operations.setOcrmypdf("/opt/custom/ocrmypdf");
            operations.setSoffice("/opt/custom/soffice");

            RuntimePathConfig config = build(properties);

            assertEquals("/opt/custom/weasyprint", config.getWeasyPrintPath());
            assertEquals("/opt/custom/unoconvert", config.getUnoConvertPath());
            assertEquals("/opt/custom/ebook-convert", config.getCalibrePath());
            assertEquals("/opt/custom/ocrmypdf", config.getOcrMyPdfPath());
            assertEquals("/opt/custom/soffice", config.getSOfficePath());
        }

        @Test
        @DisplayName("Blank custom operation path falls back to the default")
        void blankOperationPathFallsBack() {
            ApplicationProperties properties = newProperties();
            properties.getSystem().getCustomPaths().getOperations().setWeasyprint("   ");

            RuntimePathConfig config = build(properties);

            assertEquals("weasyprint", config.getWeasyPrintPath());
        }

        @Test
        @DisplayName("A single custom path leaves the other operation paths at defaults")
        void partialOperationOverride() {
            ApplicationProperties properties = newProperties();
            properties
                    .getSystem()
                    .getCustomPaths()
                    .getOperations()
                    .setSoffice("/usr/local/soffice");

            RuntimePathConfig config = build(properties);

            assertEquals("/usr/local/soffice", config.getSOfficePath());
            assertEquals("weasyprint", config.getWeasyPrintPath());
            assertEquals("unoconvert", config.getUnoConvertPath());
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
    @DisplayName("UNO server endpoint resolution")
    class UnoServerEndpoints {

        @Test
        @DisplayName("Auto mode builds one endpoint when session limit is unset (defaults to 1)")
        void autoSingleEndpointByDefault() {
            // Default ApplicationProperties: autoUnoServer = true, libreOfficeSessionLimit = 0 ->
            // 1.
            RuntimePathConfig config = build(newProperties());

            List<UnoServerEndpoint> endpoints = config.getUnoServerEndpoints();
            assertEquals(1, endpoints.size());
            assertEquals("127.0.0.1", endpoints.get(0).getHost());
            assertEquals(2003, endpoints.get(0).getPort());
        }

        @Test
        @DisplayName("Auto mode builds N endpoints on consecutive even ports")
        void autoMultipleEndpoints() {
            ApplicationProperties properties = newProperties();
            properties.getProcessExecutor().getSessionLimit().setLibreOfficeSessionLimit(3);

            RuntimePathConfig config = build(properties);

            List<UnoServerEndpoint> endpoints = config.getUnoServerEndpoints();
            assertEquals(3, endpoints.size());
            assertEquals(2003, endpoints.get(0).getPort());
            assertEquals(2005, endpoints.get(1).getPort());
            assertEquals(2007, endpoints.get(2).getPort());
            for (UnoServerEndpoint endpoint : endpoints) {
                assertEquals("127.0.0.1", endpoint.getHost());
            }
        }

        @Test
        @DisplayName("Manual mode returns the configured (valid) endpoints")
        void manualEndpointsAreUsed() {
            ApplicationProperties properties = newProperties();
            ApplicationProperties.ProcessExecutor processExecutor = properties.getProcessExecutor();
            processExecutor.setAutoUnoServer(false);

            UnoServerEndpoint endpoint = new UnoServerEndpoint();
            endpoint.setHost("10.0.0.5");
            endpoint.setPort(4000);
            processExecutor.setUnoServerEndpoints(new ArrayList<>(Arrays.asList(endpoint)));

            RuntimePathConfig config = build(properties);

            List<UnoServerEndpoint> endpoints = config.getUnoServerEndpoints();
            assertEquals(1, endpoints.size());
            assertEquals("10.0.0.5", endpoints.get(0).getHost());
            assertEquals(4000, endpoints.get(0).getPort());
        }

        @Test
        @DisplayName("Manual mode filters out endpoints with blank host or non-positive port")
        void manualEndpointsAreSanitized() {
            ApplicationProperties properties = newProperties();
            ApplicationProperties.ProcessExecutor processExecutor = properties.getProcessExecutor();
            processExecutor.setAutoUnoServer(false);

            UnoServerEndpoint valid = new UnoServerEndpoint();
            valid.setHost("192.168.1.10");
            valid.setPort(5000);

            UnoServerEndpoint blankHost = new UnoServerEndpoint();
            blankHost.setHost("   ");
            blankHost.setPort(5001);

            UnoServerEndpoint badPort = new UnoServerEndpoint();
            badPort.setHost("192.168.1.11");
            badPort.setPort(0);

            processExecutor.setUnoServerEndpoints(
                    new ArrayList<>(Arrays.asList(valid, blankHost, badPort)));

            RuntimePathConfig config = build(properties);

            List<UnoServerEndpoint> endpoints = config.getUnoServerEndpoints();
            assertEquals(1, endpoints.size());
            assertEquals("192.168.1.10", endpoints.get(0).getHost());
            assertEquals(5000, endpoints.get(0).getPort());
        }

        @Test
        @DisplayName("Manual mode with no usable endpoints falls back to a single default endpoint")
        void manualModeNoEndpointsFallsBackToDefault() {
            ApplicationProperties properties = newProperties();
            ApplicationProperties.ProcessExecutor processExecutor = properties.getProcessExecutor();
            processExecutor.setAutoUnoServer(false);
            processExecutor.setUnoServerEndpoints(new ArrayList<>());

            RuntimePathConfig config = build(properties);

            List<UnoServerEndpoint> endpoints = config.getUnoServerEndpoints();
            assertEquals(1, endpoints.size());
            assertEquals("127.0.0.1", endpoints.get(0).getHost());
            assertEquals(2003, endpoints.get(0).getPort());
        }

        @Test
        @DisplayName("Null processExecutor defaults to a single UNO endpoint")
        void nullProcessExecutorDefaultsToSingleEndpoint() {
            ApplicationProperties properties = newProperties();
            properties.setProcessExecutor(null);

            RuntimePathConfig config = build(properties);

            List<UnoServerEndpoint> endpoints = config.getUnoServerEndpoints();
            assertEquals(1, endpoints.size());
            assertEquals("127.0.0.1", endpoints.get(0).getHost());
            assertEquals(2003, endpoints.get(0).getPort());
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
            assertNotNull(config.getWeasyPrintPath());
            assertNotNull(config.getUnoConvertPath());
            assertNotNull(config.getCalibrePath());
            assertNotNull(config.getOcrMyPdfPath());
            assertNotNull(config.getSOfficePath());
            assertNotNull(config.getTessDataPath());
            assertNotNull(config.getUnoServerEndpoints());
            assertTrue(config.getUnoServerEndpoints().size() >= 1);
        }
    }
}
