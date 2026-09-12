package stirling.software.SPDF.controller.api.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import stirling.software.SPDF.service.ApiDocService;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.service.PostHogService;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.common.util.FileReadinessChecker;
import stirling.software.common.util.TempFileManager;

import tools.jackson.databind.ObjectMapper;

/** The pipeline engine must never run on the desktop bundle, where work would go unmetered. */
class PipelineDesktopExclusionTest {

    private static final String TAURI_PROP = "STIRLING_PDF_TAURI_MODE";

    private final ApplicationContextRunner runner =
            new ApplicationContextRunner()
                    .withUserConfiguration(
                            PipelineDependencies.class,
                            PipelineDirectoryProcessor.class,
                            PipelineController.class);

    @Test
    void scheduledScannerAndRouteAreAbsentInTheDesktopBundle() {
        runner.withPropertyValues(TAURI_PROP + "=true")
                .run(
                        context ->
                                assertThat(context)
                                        .hasNotFailed()
                                        .doesNotHaveBean(PipelineDirectoryProcessor.class)
                                        .doesNotHaveBean(PipelineController.class));
    }

    @Test
    void scheduledScannerAndRouteWireOnAServer() {
        // Absent property is the server case, so the guard must not fail closed.
        runner.run(
                context ->
                        assertThat(context)
                                .hasNotFailed()
                                .hasSingleBean(PipelineDirectoryProcessor.class)
                                .hasSingleBean(PipelineController.class));
    }

    @Test
    void anExplicitlyFalsePropertyStillWiresOnAServer() {
        runner.withPropertyValues(TAURI_PROP + "=false")
                .run(
                        context ->
                                assertThat(context)
                                        .hasNotFailed()
                                        .hasSingleBean(PipelineDirectoryProcessor.class)
                                        .hasSingleBean(PipelineController.class));
    }

    @Configuration(proxyBeanMethods = false)
    static class PipelineDependencies {

        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }

        @Bean
        ApiDocService apiDocService() {
            return mock(ApiDocService.class);
        }

        @Bean
        ToolMetadataService toolMetadataService() {
            return mock(ToolMetadataService.class);
        }

        @Bean
        PipelineProcessor pipelineProcessor() {
            return mock(PipelineProcessor.class);
        }

        @Bean
        PostHogService postHogService() {
            return mock(PostHogService.class);
        }

        @Bean
        FileReadinessChecker fileReadinessChecker() {
            return mock(FileReadinessChecker.class);
        }

        @Bean
        TempFileManager tempFileManager() {
            return mock(TempFileManager.class);
        }

        @Bean
        RuntimePathConfig runtimePathConfig() {
            RuntimePathConfig config = mock(RuntimePathConfig.class);
            org.mockito.Mockito.when(config.getPipelineWatchedFoldersPaths()).thenReturn(List.of());
            org.mockito.Mockito.when(config.getPipelineFinishedFoldersPath()).thenReturn("");
            return config;
        }
    }
}
