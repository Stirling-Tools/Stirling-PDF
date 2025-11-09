package stirling.software.common.configuration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.CustomPaths;
import stirling.software.common.model.ApplicationProperties.CustomPaths.Operations;
import stirling.software.common.model.ApplicationProperties.CustomPaths.Pipeline;

class RuntimePathConfigTest {

    @Test
    void shouldUseDefaultPathsWhenNotRunningInDocker() {
        ApplicationProperties properties = new ApplicationProperties();

        try (MockedStatic<InstallationPathConfig> installationPathMock =
                        Mockito.mockStatic(InstallationPathConfig.class);
                MockedStatic<Files> filesMock = Mockito.mockStatic(Files.class)) {
            installationPathMock.when(InstallationPathConfig::getPath).thenReturn("/app");
            filesMock.when(() -> Files.exists(Path.of("/.dockerenv"))).thenReturn(false);

            RuntimePathConfig config = new RuntimePathConfig(properties);

            assertEquals(
                    Path.of("/app", "pipeline", "watchedFolders").toString(),
                    config.getPipelineWatchedFoldersPath());
            assertEquals(
                    Path.of("/app", "pipeline", "finishedFolders").toString(),
                    config.getPipelineFinishedFoldersPath());
            assertEquals(
                    Path.of("/app", "pipeline", "defaultWebUIConfigs").toString(),
                    config.getPipelineDefaultWebUiConfigs());
            assertEquals("weasyprint", config.getWeasyPrintPath());
            assertEquals("unoconvert", config.getUnoConvertPath());
        }
    }

    @Test
    void shouldUseCustomPathsWhenProvided() {
        ApplicationProperties properties = new ApplicationProperties();
        CustomPaths customPaths = properties.getSystem().getCustomPaths();
        Pipeline pipeline = customPaths.getPipeline();
        pipeline.setWatchedFoldersDir("/custom/watch");
        pipeline.setFinishedFoldersDir("/custom/finished");
        pipeline.setWebUIConfigsDir("/custom/webui");

        Operations operations = customPaths.getOperations();
        operations.setWeasyprint("/custom/weasyprint");
        operations.setUnoconvert("/custom/unoconvert");

        try (MockedStatic<InstallationPathConfig> installationPathMock =
                        Mockito.mockStatic(InstallationPathConfig.class);
                MockedStatic<Files> filesMock = Mockito.mockStatic(Files.class)) {
            installationPathMock.when(InstallationPathConfig::getPath).thenReturn("/app");
            filesMock.when(() -> Files.exists(Path.of("/.dockerenv"))).thenReturn(true);

            RuntimePathConfig config = new RuntimePathConfig(properties);

            assertEquals("/custom/watch", config.getPipelineWatchedFoldersPath());
            assertEquals("/custom/finished", config.getPipelineFinishedFoldersPath());
            assertEquals("/custom/webui", config.getPipelineDefaultWebUiConfigs());
            assertEquals("/custom/weasyprint", config.getWeasyPrintPath());
            assertEquals("/custom/unoconvert", config.getUnoConvertPath());
        }
    }

    @Test
    void shouldUseDockerDefaultsWhenRunningInDocker() {
        ApplicationProperties properties = new ApplicationProperties();

        try (MockedStatic<InstallationPathConfig> installationPathMock =
                        Mockito.mockStatic(InstallationPathConfig.class);
                MockedStatic<Files> filesMock = Mockito.mockStatic(Files.class)) {
            installationPathMock.when(InstallationPathConfig::getPath).thenReturn("/app");
            filesMock.when(() -> Files.exists(Path.of("/.dockerenv"))).thenReturn(true);

            RuntimePathConfig config = new RuntimePathConfig(properties);

            assertEquals("/opt/venv/bin/weasyprint", config.getWeasyPrintPath());
            assertEquals("/opt/venv/bin/unoconvert", config.getUnoConvertPath());
        }
    }
}
