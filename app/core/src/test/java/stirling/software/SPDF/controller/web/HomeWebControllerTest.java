package stirling.software.SPDF.controller.web;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.MockedConstruction;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.servlet.ViewResolver;
import org.springframework.web.servlet.view.AbstractView;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.model.ApplicationProperties;

@ExtendWith(MockitoExtension.class)
class HomeWebControllerTest {

    private MockMvc mockMvc;
    private ApplicationProperties applicationProperties;

    @BeforeEach
    void setup() {
        applicationProperties = mock(ApplicationProperties.class, RETURNS_DEEP_STUBS);
        HomeWebController controller = new HomeWebController(applicationProperties);

        mockMvc =
                MockMvcBuilders.standaloneSetup(controller)
                        .setViewResolvers(noOpViewResolver())
                        .build();
    }

    private static ViewResolver noOpViewResolver() {
        return (viewName, locale) ->
                new AbstractView() {
                    @Override
                    protected void renderMergedOutputModel(
                            Map<String, Object> model,
                            HttpServletRequest request,
                            HttpServletResponse response) {
                        // no-op
                    }
                };
    }

    @Nested
    @DisplayName("Simple pages & redirects")
    class SimplePagesAndRedirects {

        @Test
        @DisplayName("/about should return correct view and currentPage")
        void about_shouldReturnView() throws Exception {
            mockMvc.perform(get("/about"))
                    .andExpect(status().isOk())
                    .andExpect(view().name("about"))
                    .andExpect(model().attribute("currentPage", "about"));
        }

        @Test
        @DisplayName("/releases should return correct view")
        void releases_shouldReturnView() throws Exception {
            mockMvc.perform(get("/releases"))
                    .andExpect(status().isOk())
                    .andExpect(view().name("releases"));
        }

        @Test
        @DisplayName("/home should redirect to root")
        void home_shouldRedirect() throws Exception {
            // With the no-op resolver, "redirect:/" is treated as a view -> status OK
            mockMvc.perform(get("/home"))
                    .andExpect(status().isOk())
                    .andExpect(view().name("redirect:/"));
        }

        @Test
        @DisplayName("/home-legacy should redirect to root")
        void homeLegacy_shouldRedirect() throws Exception {
            mockMvc.perform(get("/home-legacy"))
                    .andExpect(status().isOk())
                    .andExpect(view().name("redirect:/"));
        }
    }

    @Nested
    @DisplayName("Home page with SHOW_SURVEY environment variable")
    class HomePage {

        @Test
        @DisplayName("Should correctly map SHOW_SURVEY env var to showSurveyFromDocker")
        void root_mapsEnvCorrectly() throws Exception {
            String env = System.getenv("SHOW_SURVEY");
            boolean expected = (env == null) || "true".equalsIgnoreCase(env);

            mockMvc.perform(get("/"))
                    .andExpect(status().isOk())
                    .andExpect(view().name("home"))
                    .andExpect(model().attribute("currentPage", "home"))
                    .andExpect(model().attribute("showSurveyFromDocker", expected));
        }
    }

    @Nested
    @DisplayName("/robots.txt behavior")
    class RobotsTxt {

        @Test
        @DisplayName("googlevisibility=true -> allow all agents")
        void robots_allow() throws Exception {
            when(applicationProperties.getSystem().isGooglevisibility()).thenReturn(true);

            mockMvc.perform(get("/robots.txt"))
                    .andExpect(status().isOk())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_PLAIN))
                    .andExpect(
                            content()
                                    .string(
                                            "User-agent: Googlebot\n"
                                                    + "Allow: /\n\n"
                                                    + "User-agent: *\n"
                                                    + "Allow: /"));
        }

        @Test
        @DisplayName("googlevisibility=false -> disallow all agents")
        void robots_disallow() throws Exception {
            when(applicationProperties.getSystem().isGooglevisibility()).thenReturn(false);

            mockMvc.perform(get("/robots.txt"))
                    .andExpect(status().isOk())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_PLAIN))
                    .andExpect(
                            content()
                                    .string(
                                            "User-agent: Googlebot\n"
                                                    + "Disallow: /\n\n"
                                                    + "User-agent: *\n"
                                                    + "Disallow: /"));
        }

        @Test
        @DisplayName("googlevisibility not set (default false) -> disallow all")
        void robots_disallowWhenNotSet() throws Exception {
            when(applicationProperties.getSystem().isGooglevisibility()).thenReturn(false);

            mockMvc.perform(get("/robots.txt"))
                    .andExpect(status().isOk())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_PLAIN))
                    .andExpect(
                            content()
                                    .string(
                                            "User-agent: Googlebot\n"
                                                    + "Disallow: /\n\n"
                                                    + "User-agent: *\n"
                                                    + "Disallow: /"));
        }
    }

    @Nested
    @DisplayName("/licenses endpoint")
    class Licenses {

        @Test
        @DisplayName("Should read JSON and set dependencies + currentPage on model")
        void licenses_success() throws Exception {
            // Minimal valid JSON matching Map<String, List<Dependency>>
            String json = "{\"dependencies\":[{}]}";

            try (MockedConstruction<ClassPathResource> mockedResource =
                    mockConstruction(
                            ClassPathResource.class,
                            (mock, ctx) ->
                                    when(mock.getInputStream())
                                            .thenReturn(
                                                    new ByteArrayInputStream(
                                                            json.getBytes(
                                                                    StandardCharsets.UTF_8))))) {

                var mvcResult =
                        mockMvc.perform(get("/licenses"))
                                .andExpect(status().isOk())
                                .andExpect(view().name("licenses"))
                                .andExpect(model().attribute("currentPage", "licenses"))
                                .andExpect(model().attributeExists("dependencies"))
                                .andReturn();

                Object depsObj = mvcResult.getModelAndView().getModel().get("dependencies");
                Assertions.assertTrue(depsObj instanceof java.util.List<?>);
                Assertions.assertEquals(
                        1, ((java.util.List<?>) depsObj).size(), "Exactly one dependency expected");
            }
        }

        @Test
        @DisplayName("IOException while reading -> still returns licenses view")
        void licenses_ioException() throws Exception {
            try (MockedConstruction<ClassPathResource> mockedResource =
                    mockConstruction(
                            ClassPathResource.class,
                            (mock, ctx) ->
                                    when(mock.getInputStream())
                                            .thenThrow(new IOException("boom")))) {

                mockMvc.perform(get("/licenses"))
                        .andExpect(status().isOk())
                        .andExpect(view().name("licenses"))
                        .andExpect(model().attribute("currentPage", "licenses"));
            }
        }
    }
}
