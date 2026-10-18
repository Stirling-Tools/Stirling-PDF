package stirling.software.SPDF.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.SPDF.controller.web.ReactRoutingController;

class CleanUrlInterceptorMvcTest {

    private static final String BROWSER_STATE = "a".repeat(64);
    private static final String SPA_HTML = "<html><body>Stirling PDF</body></html>";

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        ReactRoutingController controller = new ReactRoutingController();
        ReflectionTestUtils.setField(controller, "cachedIndexHtml", SPA_HTML);
        ReflectionTestUtils.setField(controller, "indexHtmlExists", true);
        mvc =
                MockMvcBuilders.standaloneSetup(controller)
                        .addInterceptors(new CleanUrlInterceptor())
                        .build();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "/stirling", "/stirling/nested"})
    void servesAccountLinkCallbackWithoutStrippingBrowserState(String contextPath)
            throws Exception {
        mvc.perform(
                        get(contextPath + "/account-link/callback")
                                .contextPath(contextPath)
                                .queryParam("state", BROWSER_STATE))
                .andExpect(status().isOk())
                .andExpect(header().doesNotExist("Location"))
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(SPA_HTML));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "/stirling", "/stirling/nested"})
    void callbackCleaningPreservesBrowserStateAndContextPath(String contextPath) throws Exception {
        String callbackPath = contextPath + "/account-link/callback";
        String cleanedUrl = callbackPath + "?state=" + BROWSER_STATE;

        mvc.perform(
                        get(callbackPath)
                                .contextPath(contextPath)
                                .queryParam("state", BROWSER_STATE)
                                .queryParam("unexpected", "discard"))
                .andExpect(status().isFound())
                .andExpect(redirectedUrl(cleanedUrl));

        mvc.perform(get(cleanedUrl).contextPath(contextPath))
                .andExpect(status().isOk())
                .andExpect(header().doesNotExist("Location"))
                .andExpect(content().string(SPA_HTML));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "/settings",
                "/settings/account-link",
                "/account-link/other",
                "/other/callback"
            })
    void stateRemainsDisallowedOutsideAccountLinkCallback(String path) throws Exception {
        mvc.perform(get(path).queryParam("state", BROWSER_STATE))
                .andExpect(status().isFound())
                .andExpect(redirectedUrl(path + "?"));
    }
}
