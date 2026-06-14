package stirling.software.proprietary.formdetection.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.proprietary.formdetection.model.ModelStatusResponse;
import stirling.software.proprietary.formdetection.service.FormDetectionModelManager;

class FormDetectionModelControllerTest {

    private ModelStatusResponse notInstalled() {
        return new ModelStatusResponse(
                "not_installed", 0, "", List.of(), null, true, List.of(), true, "auto");
    }

    private MockMvc mvc(FormDetectionModelManager manager) {
        return MockMvcBuilders.standaloneSetup(new FormDetectionModelController(manager)).build();
    }

    @Test
    void statusReturnsJson() throws Exception {
        FormDetectionModelManager manager = Mockito.mock(FormDetectionModelManager.class);
        Mockito.when(manager.status()).thenReturn(notInstalled());

        mvc(manager)
                .perform(get("/api/v1/ai/form-detection-model/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("not_installed"))
                .andExpect(jsonPath("$.writable").value(true));
    }

    @Test
    void installWithBlankModelIdReturns400() throws Exception {
        FormDetectionModelManager manager = Mockito.mock(FormDetectionModelManager.class);
        Mockito.when(manager.status()).thenReturn(notInstalled());

        mvc(manager)
                .perform(
                        post("/api/v1/ai/form-detection-model/install")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"modelId\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void installValidReturns202() throws Exception {
        FormDetectionModelManager manager = Mockito.mock(FormDetectionModelManager.class);
        Mockito.when(manager.status()).thenReturn(notInstalled());

        mvc(manager)
                .perform(
                        post("/api/v1/ai/form-detection-model/install")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"modelId\":\"ffdnet-s\"}"))
                .andExpect(status().isAccepted());
    }

    @Test
    void installWhileBusyReturns409() throws Exception {
        FormDetectionModelManager manager = Mockito.mock(FormDetectionModelManager.class);
        Mockito.when(manager.status()).thenReturn(notInstalled());
        Mockito.doThrow(new IllegalStateException("An install is already in progress"))
                .when(manager)
                .startInstall(Mockito.eq("ffdnet-s"), Mockito.any(), Mockito.any());

        mvc(manager)
                .perform(
                        post("/api/v1/ai/form-detection-model/install")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"modelId\":\"ffdnet-s\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void deleteReturnsStatus() throws Exception {
        FormDetectionModelManager manager = Mockito.mock(FormDetectionModelManager.class);
        Mockito.when(manager.status()).thenReturn(notInstalled());

        mvc(manager)
                .perform(delete("/api/v1/ai/form-detection-model"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("not_installed"));
    }
}
