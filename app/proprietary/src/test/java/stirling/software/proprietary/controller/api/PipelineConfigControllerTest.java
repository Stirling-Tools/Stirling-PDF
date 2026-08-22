package stirling.software.proprietary.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import stirling.software.common.configuration.RuntimePathConfig;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.ObjectWriter;

@ExtendWith(MockitoExtension.class)
class PipelineConfigControllerTest {

    @Mock private RuntimePathConfig runtimePathConfig;
    @Mock private ObjectMapper objectMapper;
    @Mock private ObjectWriter objectWriter;

    @TempDir Path tempDir;

    @Test
    void saveConfigToWatchedFolder_returnsBadRequest_whenRequestIsNull() {
        PipelineConfigController controller =
                new PipelineConfigController(runtimePathConfig, objectMapper);

        ResponseEntity<?> response = controller.saveConfigToWatchedFolder(null);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertEquals("Missing request body or config payload", body.get("error"));
    }

    @Test
    void saveConfigToWatchedFolder_returnsBadRequest_whenConfigIsNull() {
        PipelineConfigController controller =
                new PipelineConfigController(runtimePathConfig, objectMapper);
        PipelineConfigController.SaveWatchedFolderConfigRequest request =
                new PipelineConfigController.SaveWatchedFolderConfigRequest();
        request.setConfig(null);

        ResponseEntity<?> response = controller.saveConfigToWatchedFolder(request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertEquals("Missing request body or config payload", body.get("error"));
    }

    @Test
    void saveConfigToWatchedFolder_returnsBadRequest_whenSubfolderEscapesWatchedRoot() {
        when(runtimePathConfig.getPipelineWatchedFoldersPath()).thenReturn(tempDir.toString());
        PipelineConfigController controller =
                new PipelineConfigController(runtimePathConfig, objectMapper);

        PipelineConfigController.SaveWatchedFolderConfigRequest request =
                new PipelineConfigController.SaveWatchedFolderConfigRequest();
        request.setSubfolder("../outside");
        request.setFileName("config");
        request.setConfig(Map.of("enabled", true));

        ResponseEntity<?> response = controller.saveConfigToWatchedFolder(request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertEquals("Invalid subfolder path", body.get("error"));
    }

    @Test
    void saveConfigToWatchedFolder_savesFileAndReturnsSuccess() throws IOException {
        when(runtimePathConfig.getPipelineWatchedFoldersPath()).thenReturn(tempDir.toString());
        when(objectMapper.writerWithDefaultPrettyPrinter()).thenReturn(objectWriter);
        when(objectWriter.writeValueAsString(any())).thenReturn("{\"k\":\"v\"}");
        PipelineConfigController controller =
                new PipelineConfigController(runtimePathConfig, objectMapper);

        PipelineConfigController.SaveWatchedFolderConfigRequest request =
                new PipelineConfigController.SaveWatchedFolderConfigRequest();
        request.setSubfolder("incoming");
        request.setFileName("my:config");
        request.setConfig(Map.of("k", "v"));

        ResponseEntity<?> response = controller.saveConfigToWatchedFolder(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertEquals(true, body.get("success"));
        assertEquals("my_config.json", body.get("fileName"));

        Path expectedFile = tempDir.resolve("incoming").resolve("my_config.json");
        assertTrue(Files.exists(expectedFile));
        assertEquals("{\"k\":\"v\"}", Files.readString(expectedFile));
    }

    @Test
    void saveConfigToWatchedFolder_returnsInternalServerError_whenWriteFails() throws IOException {
        Path watchedRootAsFile = tempDir.resolve("watched-root-file");
        Files.writeString(watchedRootAsFile, "not-a-directory");
        when(runtimePathConfig.getPipelineWatchedFoldersPath())
                .thenReturn(watchedRootAsFile.toString());
        PipelineConfigController controller =
                new PipelineConfigController(runtimePathConfig, objectMapper);

        PipelineConfigController.SaveWatchedFolderConfigRequest request =
                new PipelineConfigController.SaveWatchedFolderConfigRequest();
        request.setSubfolder("incoming");
        request.setFileName("config");
        request.setConfig(Map.of("k", "v"));

        ResponseEntity<?> response = controller.saveConfigToWatchedFolder(request);

        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertEquals("Failed to write config file", body.get("error"));
    }
}
