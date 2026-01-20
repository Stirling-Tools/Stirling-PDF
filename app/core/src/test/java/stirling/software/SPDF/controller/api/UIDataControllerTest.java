package stirling.software.SPDF.controller.api;

import static org.hamcrest.Matchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ResourceLoader;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.SPDF.service.SharedSignatureService;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;

class UIDataControllerTest {

    @TempDir Path tempDir;

    @Test
    void tessdataLanguages_listsInstalledAndWritable() throws Exception {
        // Arrange tessdata directory with two languages plus osd (filtered)
        Files.createFile(tempDir.resolve("eng.traineddata"));
        Files.createFile(tempDir.resolve("deu.traineddata"));
        Files.createFile(tempDir.resolve("osd.traineddata"));
        Files.createFile(tempDir.resolve("notes.txt"));

        ApplicationProperties applicationProperties = mock(ApplicationProperties.class);
        SharedSignatureService signatureService = mock(SharedSignatureService.class);
        UserServiceInterface userService = mock(UserServiceInterface.class);
        ResourceLoader resourceLoader = mock(ResourceLoader.class);
        RuntimePathConfig runtimePathConfig = mock(RuntimePathConfig.class);
        when(runtimePathConfig.getTessDataPath()).thenReturn(tempDir.toString());

        UIDataController controller =
                new UIDataController(
                        applicationProperties,
                        signatureService,
                        userService,
                        resourceLoader,
                        runtimePathConfig);

        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();

        // Act & Assert
        mvc.perform(get("/api/v1/ui-data/tessdata-languages"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.installed", contains("deu", "eng")))
                .andExpect(jsonPath("$.writable").value(true));
    }
}
