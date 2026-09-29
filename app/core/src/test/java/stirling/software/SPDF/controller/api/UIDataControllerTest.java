package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.http.ResponseEntity;

import stirling.software.SPDF.service.SharedSignatureService;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;

import tools.jackson.databind.ObjectMapper;

class UIDataControllerTest {

    @TempDir Path tempDir;

    @Test
    void getPipelineData_usesEachSourceFilenameWhenJsonContentIsIdentical() throws Exception {
        Path configDir = tempDir.resolve("defaultWebUIConfigs");
        Files.createDirectories(configDir);

        String configJson = "{\"steps\":[]}";
        Files.writeString(configDir.resolve("first-config.json"), configJson);
        Files.writeString(configDir.resolve("second-config.json"), configJson);

        ApplicationProperties applicationProperties = mock(ApplicationProperties.class);
        SharedSignatureService signatureService = mock(SharedSignatureService.class);
        RuntimePathConfig runtimePathConfig = mock(RuntimePathConfig.class);

        when(runtimePathConfig.getPipelineDefaultWebUiConfigs()).thenReturn(configDir.toString());

        UIDataController controller =
                new UIDataController(
                        applicationProperties,
                        signatureService,
                        null,
                        new DefaultResourceLoader(),
                        runtimePathConfig,
                        new ObjectMapper());

        ResponseEntity<UIDataController.PipelineData> response = controller.getPipelineData();

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        UIDataController.PipelineData body = response.getBody();
        assertThat(body).isNotNull();

        List<Map<String, String>> configsWithNames = body.getPipelineConfigsWithNames();
        assertThat(configsWithNames).hasSize(2);
        assertThat(configsWithNames)
                .extracting(entry -> entry.get("name"))
                .containsExactlyInAnyOrder("first-config", "second-config");
        assertThat(configsWithNames)
                .extracting(entry -> entry.get("json"))
                .containsOnly(configJson);
    }
}
