package stirling.software.SPDF.controller.web;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.ApplicationContextProvider;
import stirling.software.common.util.CheckProgramInstall;

@ExtendWith(MockitoExtension.class)
class ConverterWebControllerTest {

    private MockMvc mockMvc;

    private ConverterWebController controller;

    @BeforeEach
    void setup() {
        controller = new ConverterWebController();
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    private static Stream<Object[]> simpleEndpoints() {
        return Stream.of(
                new Object[] {"/img-to-pdf", "convert/img-to-pdf", "img-to-pdf"},
                new Object[] {"/cbz-to-pdf", "convert/cbz-to-pdf", "cbz-to-pdf"},
                new Object[] {"/pdf-to-cbz", "convert/pdf-to-cbz", "pdf-to-cbz"},
                new Object[] {"/cbr-to-pdf", "convert/cbr-to-pdf", "cbr-to-pdf"},
                new Object[] {"/html-to-pdf", "convert/html-to-pdf", "html-to-pdf"},
                new Object[] {"/markdown-to-pdf", "convert/markdown-to-pdf", "markdown-to-pdf"},
                new Object[] {"/pdf-to-markdown", "convert/pdf-to-markdown", "pdf-to-markdown"},
                new Object[] {"/url-to-pdf", "convert/url-to-pdf", "url-to-pdf"},
                new Object[] {"/file-to-pdf", "convert/file-to-pdf", "file-to-pdf"},
                new Object[] {"/pdf-to-pdfa", "convert/pdf-to-pdfa", "pdf-to-pdfa"},
                new Object[] {"/pdf-to-vector", "convert/pdf-to-vector", "pdf-to-vector"},
                new Object[] {"/vector-to-pdf", "convert/vector-to-pdf", "vector-to-pdf"},
                new Object[] {"/pdf-to-xml", "convert/pdf-to-xml", "pdf-to-xml"},
                new Object[] {"/pdf-to-csv", "convert/pdf-to-csv", "pdf-to-csv"},
                new Object[] {"/pdf-to-html", "convert/pdf-to-html", "pdf-to-html"},
                new Object[] {
                    "/pdf-to-presentation", "convert/pdf-to-presentation", "pdf-to-presentation"
                },
                new Object[] {"/pdf-to-text", "convert/pdf-to-text", "pdf-to-text"},
                new Object[] {"/pdf-to-word", "convert/pdf-to-word", "pdf-to-word"},
                new Object[] {"/eml-to-pdf", "convert/eml-to-pdf", "eml-to-pdf"});
    }

    @ParameterizedTest(name = "[{index}] GET {0}")
    @MethodSource("simpleEndpoints")
    @DisplayName("Should return correct view and model for simple endpoints")
    void shouldReturnCorrectViewForSimpleEndpoints(String path, String viewName, String page)
            throws Exception {
        mockMvc.perform(get(path))
                .andExpect(status().isOk())
                .andExpect(view().name(viewName))
                .andExpect(model().attribute("currentPage", page));
    }

    @Nested
    @DisplayName("PDF to CBR endpoint tests")
    class PdfToCbrTests {

        @Test
        @DisplayName("Should return 404 when endpoint disabled")
        void shouldReturn404WhenDisabled() throws Exception {
            try (MockedStatic<ApplicationContextProvider> acp =
                    org.mockito.Mockito.mockStatic(ApplicationContextProvider.class)) {
                EndpointConfiguration endpointConfig = mock(EndpointConfiguration.class);
                when(endpointConfig.isEndpointEnabled(eq("pdf-to-cbr"))).thenReturn(false);
                acp.when(() -> ApplicationContextProvider.getBean(EndpointConfiguration.class))
                        .thenReturn(endpointConfig);

                mockMvc.perform(get("/pdf-to-cbr")).andExpect(status().isNotFound());
            }
        }

        @Test
        @DisplayName("Should return OK when endpoint enabled")
        void shouldReturnOkWhenEnabled() throws Exception {
            try (MockedStatic<ApplicationContextProvider> acp =
                    org.mockito.Mockito.mockStatic(ApplicationContextProvider.class)) {
                EndpointConfiguration endpointConfig = mock(EndpointConfiguration.class);
                when(endpointConfig.isEndpointEnabled(eq("pdf-to-cbr"))).thenReturn(true);
                acp.when(() -> ApplicationContextProvider.getBean(EndpointConfiguration.class))
                        .thenReturn(endpointConfig);

                mockMvc.perform(get("/pdf-to-cbr"))
                        .andExpect(status().isOk())
                        .andExpect(view().name("convert/pdf-to-cbr"))
                        .andExpect(model().attribute("currentPage", "pdf-to-cbr"));
            }
        }
    }

    @Test
    @DisplayName("Should handle pdf-to-img with default maxDPI=500")
    void shouldHandlePdfToImgWithDefaultMaxDpi() throws Exception {
        try (MockedStatic<ApplicationContextProvider> acp =
                        org.mockito.Mockito.mockStatic(ApplicationContextProvider.class);
                MockedStatic<CheckProgramInstall> cpi =
                        org.mockito.Mockito.mockStatic(CheckProgramInstall.class)) {
            cpi.when(CheckProgramInstall::isPythonAvailable).thenReturn(true);
            acp.when(() -> ApplicationContextProvider.getBean(ApplicationProperties.class))
                    .thenReturn(null);

            mockMvc.perform(get("/pdf-to-img"))
                    .andExpect(status().isOk())
                    .andExpect(view().name("convert/pdf-to-img"))
                    .andExpect(model().attribute("isPython", true))
                    .andExpect(model().attribute("maxDPI", 500));
        }
    }

    @Test
    @DisplayName("Should handle pdf-to-video with default maxDPI=500")
    void shouldHandlePdfToVideoWithDefaultMaxDpi() throws Exception {
        try (MockedStatic<ApplicationContextProvider> acp =
                org.mockito.Mockito.mockStatic(ApplicationContextProvider.class)) {
            acp.when(() -> ApplicationContextProvider.getBean(ApplicationProperties.class))
                    .thenReturn(null);

            mockMvc.perform(get("/pdf-to-video"))
                    .andExpect(status().isOk())
                    .andExpect(view().name("convert/pdf-to-video"))
                    .andExpect(model().attribute("maxDPI", 500))
                    .andExpect(model().attribute("currentPage", "pdf-to-video"));
        }
    }

    @Test
    @DisplayName("Should handle pdf-to-img with configured maxDPI from properties")
    void shouldHandlePdfToImgWithConfiguredMaxDpi() throws Exception {
        // Covers the 'if' branch (properties and system not null)
        try (MockedStatic<ApplicationContextProvider> acp =
                        org.mockito.Mockito.mockStatic(ApplicationContextProvider.class);
                MockedStatic<CheckProgramInstall> cpi =
                        org.mockito.Mockito.mockStatic(CheckProgramInstall.class)) {

            ApplicationProperties properties =
                    org.mockito.Mockito.mock(
                            ApplicationProperties.class, org.mockito.Mockito.RETURNS_DEEP_STUBS);
            when(properties.getSystem().getMaxDPI()).thenReturn(777);
            acp.when(() -> ApplicationContextProvider.getBean(ApplicationProperties.class))
                    .thenReturn(properties);
            cpi.when(CheckProgramInstall::isPythonAvailable).thenReturn(true);

            mockMvc.perform(get("/pdf-to-img"))
                    .andExpect(status().isOk())
                    .andExpect(view().name("convert/pdf-to-img"))
                    .andExpect(model().attribute("isPython", true))
                    .andExpect(model().attribute("maxDPI", 777))
                    .andExpect(model().attribute("currentPage", "pdf-to-img"));
        }
    }

    @Test
    @DisplayName("Should handle pdf-to-video with configured maxDPI from properties")
    void shouldHandlePdfToVideoWithConfiguredMaxDpi() throws Exception {
        // Covers the 'if' branch (properties and system not null)
        try (MockedStatic<ApplicationContextProvider> acp =
                org.mockito.Mockito.mockStatic(ApplicationContextProvider.class)) {

            ApplicationProperties properties =
                    org.mockito.Mockito.mock(
                            ApplicationProperties.class, org.mockito.Mockito.RETURNS_DEEP_STUBS);
            when(properties.getSystem().getMaxDPI()).thenReturn(640);
            acp.when(() -> ApplicationContextProvider.getBean(ApplicationProperties.class))
                    .thenReturn(properties);

            mockMvc.perform(get("/pdf-to-video"))
                    .andExpect(status().isOk())
                    .andExpect(view().name("convert/pdf-to-video"))
                    .andExpect(model().attribute("maxDPI", 640))
                    .andExpect(model().attribute("currentPage", "pdf-to-video"));
        }
    }
}
