package stirling.software.proprietary.security.controller.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.common.configuration.RuntimePathConfig;

class UIDataTessdataControllerTest {

    @Test
    void downloadTessdataLanguages_withEmptyList_returnsBadRequest() throws Exception {
        RuntimePathConfig runtimePathConfig = Mockito.mock(RuntimePathConfig.class);
        Mockito.when(runtimePathConfig.getTessDataPath()).thenReturn("ignored/path");

        UIDataTessdataController controller = new UIDataTessdataController(runtimePathConfig);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();

        mvc.perform(
                        post("/api/v1/ui-data/tessdata/download")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"languages\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("No languages provided for download"));
    }
}
