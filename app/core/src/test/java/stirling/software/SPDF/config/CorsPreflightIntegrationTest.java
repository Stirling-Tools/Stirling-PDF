package stirling.software.SPDF.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import stirling.software.common.model.ApplicationProperties;

/**
 * Guards the CORS scoping invariant: preflight (OPTIONS) requests to API endpoints are answered
 * with {@code Access-Control-Allow-Origin}, while static assets must never carry CORS headers (they
 * fragment CDN and browser caches per origin, and intermediaries strip them on cache hits).
 */
@WebMvcTest(
        controllers = CorsPreflightIntegrationTest.CorsProbeController.class,
        useDefaultFilters = false)
@AutoConfigureMockMvc(addFilters = false)
@Import({WebMvcConfig.class, CorsPreflightIntegrationTest.MockInterceptorsConfig.class})
class CorsPreflightIntegrationTest {

    private static final String ORIGIN = "https://app.example.com";

    @Autowired private MockMvc mockMvc;

    /** Supplies WebMvcConfig's constructor dependencies without dragging in the app context. */
    @Configuration
    static class MockInterceptorsConfig {

        @Bean
        EndpointInterceptor endpointInterceptor() throws Exception {
            EndpointInterceptor mock = Mockito.mock(EndpointInterceptor.class);
            Mockito.when(mock.preHandle(Mockito.any(), Mockito.any(), Mockito.any()))
                    .thenReturn(true);
            return mock;
        }

        @Bean
        PdfMetricsInterceptor pdfMetricsInterceptor() throws Exception {
            PdfMetricsInterceptor mock = Mockito.mock(PdfMetricsInterceptor.class);
            Mockito.when(mock.preHandle(Mockito.any(), Mockito.any(), Mockito.any()))
                    .thenReturn(true);
            return mock;
        }

        @Bean
        ApplicationProperties applicationProperties() {
            return new ApplicationProperties();
        }
    }

    @RestController
    @RequestMapping("/api/v1/cors-probe")
    static class CorsProbeController {

        @GetMapping
        String probe() {
            return "ok";
        }
    }

    @Test
    @DisplayName("preflight to an API endpoint returns Access-Control-Allow-Origin")
    void preflightOnApiReturnsCorsHeaders() throws Exception {
        mockMvc.perform(
                        options("/api/v1/cors-probe")
                                .header("Origin", ORIGIN)
                                .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", ORIGIN))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
    }

    @Test
    @DisplayName("preflight to a static asset never returns CORS headers")
    void preflightOnAssetOmitsCorsHeaders() throws Exception {
        mockMvc.perform(
                        options("/assets/cors-probe.js")
                                .header("Origin", ORIGIN)
                                .header("Access-Control-Request-Method", "GET"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }
}
