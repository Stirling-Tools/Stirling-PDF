package stirling.software.SPDF.controller.api;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;

class SettingsControllerTest {

    private MockMvc mockMvc(ApplicationProperties props, EndpointConfiguration endpoints) {
        SettingsController controller = new SettingsController(props, endpoints);
        return MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    void update_enable_analytics_returns_208_when_already_set() throws Exception {
        ApplicationProperties props = new ApplicationProperties();
        props.getSystem().setEnableAnalytics(Boolean.FALSE);

        EndpointConfiguration endpoints = mock(EndpointConfiguration.class);

        try (MockedStatic<InstallationPathConfig> install =
                        Mockito.mockStatic(InstallationPathConfig.class);
                MockedStatic<GeneralUtils> gen = Mockito.mockStatic(GeneralUtils.class)) {

            install.when(InstallationPathConfig::getSettingsPath)
                    .thenReturn("/etc/spdf/settings.yml");

            MockMvc mvc = mockMvc(props, endpoints);

            // Act + Assert
            mvc.perform(
                            post("/api/v1/settings/update-enable-analytics")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("true"))
                    .andExpect(status().isAlreadyReported())
                    .andExpect(content().string(containsString("Setting has already been set")))
                    .andExpect(content().string(containsString("/etc/spdf/settings.yml")));

            gen.verifyNoInteractions();
        }
    }

    @Test
    void update_enable_analytics_sets_value_and_saves_when_not_set() throws Exception {
        ApplicationProperties props = new ApplicationProperties();
        props.getSystem().setEnableAnalytics(null);

        EndpointConfiguration endpoints = mock(EndpointConfiguration.class);

        try (MockedStatic<GeneralUtils> gen = Mockito.mockStatic(GeneralUtils.class)) {
            MockMvc mvc = mockMvc(props, endpoints);

            // Act + Assert
            mvc.perform(
                            post("/api/v1/settings/update-enable-analytics")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("true"))
                    .andExpect(status().isOk())
                    .andExpect(content().string("Updated"));

            gen.verify(
                    () -> GeneralUtils.saveKeyToSettings(eq("system.enableAnalytics"), eq(true)));

            assertEquals(Boolean.TRUE, props.getSystem().getEnableAnalytics());
        }
    }

    @Test
    void get_endpoints_status_returns_map() throws Exception {
        ApplicationProperties props = new ApplicationProperties();
        EndpointConfiguration endpoints = mock(EndpointConfiguration.class);
        when(endpoints.getEndpointStatuses())
                .thenReturn(Map.of("convert.pdf.markdown", true, "merge", false));

        MockMvc mvc = mockMvc(props, endpoints);

        mvc.perform(get("/api/v1/settings/get-endpoints-status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.['convert.pdf.markdown']").value(true))
                .andExpect(jsonPath("$.merge").value(false));
    }
}
