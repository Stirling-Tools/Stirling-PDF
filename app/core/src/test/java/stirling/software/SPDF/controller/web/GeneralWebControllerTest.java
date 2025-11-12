package stirling.software.SPDF.controller.web;

import static org.hamcrest.Matchers.empty;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Stream;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.servlet.ViewResolver;
import org.springframework.web.servlet.view.AbstractView;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.SPDF.model.SignatureFile;
import stirling.software.SPDF.service.SignatureService;
import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.common.util.GeneralUtils;

@ExtendWith(MockitoExtension.class)
class GeneralWebControllerTest {

    private static final String CLASSPATH_WOFF2 = "classpath:static/fonts/*.woff2";
    private static final String FILE_FONTS_GLOB = "file:/opt/static/fonts/*";

    private static String normalize(String s) {
        return s.replace('\\', '/');
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

    @SuppressWarnings("unused")
    private static Stream<Object[]> simpleEndpoints() {
        return Stream.of(
                new Object[] {"/merge-pdfs", "merge-pdfs", "merge-pdfs"},
                new Object[] {
                    "/split-pdf-by-sections", "split-pdf-by-sections", "split-pdf-by-sections"
                },
                new Object[] {
                    "/split-pdf-by-chapters", "split-pdf-by-chapters", "split-pdf-by-chapters"
                },
                new Object[] {"/view-pdf", "view-pdf", "view-pdf"},
                new Object[] {
                    "/edit-table-of-contents", "edit-table-of-contents", "edit-table-of-contents"
                },
                new Object[] {"/multi-tool", "multi-tool", "multi-tool"},
                new Object[] {"/remove-pages", "remove-pages", "remove-pages"},
                new Object[] {"/pdf-organizer", "pdf-organizer", "pdf-organizer"},
                new Object[] {"/extract-page", "extract-page", "extract-page"},
                new Object[] {"/pdf-to-single-page", "pdf-to-single-page", "pdf-to-single-page"},
                new Object[] {"/rotate-pdf", "rotate-pdf", "rotate-pdf"},
                new Object[] {"/split-pdfs", "split-pdfs", "split-pdfs"},
                new Object[] {"/multi-page-layout", "multi-page-layout", "multi-page-layout"},
                new Object[] {"/scale-pages", "scale-pages", "scale-pages"},
                new Object[] {
                    "/split-by-size-or-count", "split-by-size-or-count", "split-by-size-or-count"
                },
                new Object[] {"/overlay-pdf", "overlay-pdf", "overlay-pdf"},
                new Object[] {"/crop", "crop", "crop"},
                new Object[] {"/auto-split-pdf", "auto-split-pdf", "auto-split-pdf"},
                new Object[] {"/remove-image-pdf", "remove-image-pdf", "remove-image-pdf"});
    }

    private MockMvc mockMvc;

    private SignatureService signatureService;
    private UserServiceInterface userService;
    private RuntimePathConfig runtimePathConfig;
    private org.springframework.core.io.ResourceLoader resourceLoader;

    private GeneralWebController controller;

    @BeforeEach
    void setUp() {
        signatureService = mock(SignatureService.class);
        userService = mock(UserServiceInterface.class);
        runtimePathConfig = mock(RuntimePathConfig.class);
        resourceLoader = mock(org.springframework.core.io.ResourceLoader.class);

        controller =
                new GeneralWebController(
                        signatureService, userService, resourceLoader, runtimePathConfig);

        mockMvc =
                MockMvcBuilders.standaloneSetup(controller)
                        .setViewResolvers(noOpViewResolver())
                        .build();
    }

    @Nested
    @DisplayName("Simple endpoints")
    class SimpleEndpoints {

        @DisplayName("Should render simple pages with correct currentPage")
        @ParameterizedTest(name = "[{index}] GET {0} -> view {1}")
        @MethodSource(
                "stirling.software.SPDF.controller.web.GeneralWebControllerTest#simpleEndpoints")
        void shouldRenderSimplePages(String path, String expectedView, String currentPage)
                throws Exception {
            mockMvc.perform(get(path))
                    .andExpect(status().isOk())
                    .andExpect(view().name(expectedView))
                    .andExpect(model().attribute("currentPage", currentPage));
        }
    }

    @Nested
    @DisplayName("/sign endpoint")
    class SignForm {

        @Test
        @DisplayName("Should use current username, list signatures and fonts")
        void shouldPopulateModelWithUserSignaturesAndFonts() throws Exception {
            when(userService.getCurrentUsername()).thenReturn("alice");
            List<SignatureFile> signatures = List.of(new SignatureFile(), new SignatureFile());
            when(signatureService.getAvailableSignatures("alice")).thenReturn(signatures);

            try (MockedStatic<GeneralUtils> gu = mockStatic(GeneralUtils.class);
                    MockedStatic<InstallationPathConfig> ipc =
                            mockStatic(InstallationPathConfig.class)) {

                ipc.when(InstallationPathConfig::getStaticPath).thenReturn("/opt/static/");

                Resource woff2 = mock(Resource.class);
                when(woff2.getFilename()).thenReturn("Roboto-Regular.woff2");
                Resource ttf = mock(Resource.class);
                when(ttf.getFilename()).thenReturn("MyFont.ttf");

                // Windows-safe conditional stub (normalize backslashes)
                gu.when(
                                () ->
                                        GeneralUtils.getResourcesFromLocationPattern(
                                                anyString(), eq(resourceLoader)))
                        .thenAnswer(
                                inv -> {
                                    String pattern = normalize(inv.getArgument(0, String.class));
                                    if (CLASSPATH_WOFF2.equals(pattern))
                                        return new Resource[] {woff2};
                                    if (FILE_FONTS_GLOB.equals(pattern))
                                        return new Resource[] {ttf};
                                    return new Resource[0];
                                });

                var mvcResult =
                        mockMvc.perform(get("/sign"))
                                .andExpect(status().isOk())
                                .andExpect(view().name("sign"))
                                .andExpect(model().attribute("currentPage", "sign"))
                                .andExpect(model().attributeExists("fonts"))
                                .andExpect(model().attribute("signatures", signatures))
                                .andReturn();

                Object fontsAttr = mvcResult.getModelAndView().getModel().get("fonts");
                Assertions.assertTrue(fontsAttr instanceof List<?>);
                List<?> fonts = (List<?>) fontsAttr;
                Assertions.assertEquals(
                        2, fonts.size(), "Expected two font entries (classpath + external)");
            }
        }

        @Test
        @DisplayName("Should handle missing UserService (username empty string)")
        void shouldHandleNullUserService() throws Exception {
            GeneralWebController ctrl =
                    new GeneralWebController(
                            signatureService, null, resourceLoader, runtimePathConfig);
            MockMvc localMvc =
                    MockMvcBuilders.standaloneSetup(ctrl)
                            .setViewResolvers(noOpViewResolver())
                            .build();

            try (MockedStatic<GeneralUtils> gu = mockStatic(GeneralUtils.class);
                    MockedStatic<InstallationPathConfig> ipc =
                            mockStatic(InstallationPathConfig.class)) {

                ipc.when(InstallationPathConfig::getStaticPath).thenReturn("/opt/static/");
                gu.when(
                                () ->
                                        GeneralUtils.getResourcesFromLocationPattern(
                                                anyString(), eq(resourceLoader)))
                        .thenReturn(new Resource[0]);

                when(signatureService.getAvailableSignatures(""))
                        .thenReturn(Collections.emptyList());

                localMvc.perform(get("/sign"))
                        .andExpect(status().isOk())
                        .andExpect(view().name("sign"))
                        .andExpect(model().attribute("currentPage", "sign"))
                        .andExpect(model().attribute("signatures", empty()));
            }
        }

        @Test
        @DisplayName(
                "Throws ServletException when a font file cannot be processed (inner try/catch"
                        + " path)")
        void shouldThrowServletExceptionWhenFontProcessingFails() {
            when(userService.getCurrentUsername()).thenReturn("alice");
            when(signatureService.getAvailableSignatures("alice"))
                    .thenReturn(Collections.emptyList());

            Resource bad = mock(Resource.class);
            when(bad.getFilename()).thenThrow(new RuntimeException("boom"));

            try (MockedStatic<GeneralUtils> gu = mockStatic(GeneralUtils.class);
                    MockedStatic<InstallationPathConfig> ipc =
                            mockStatic(InstallationPathConfig.class)) {

                ipc.when(InstallationPathConfig::getStaticPath).thenReturn("/opt/static/");

                gu.when(
                                () ->
                                        GeneralUtils.getResourcesFromLocationPattern(
                                                anyString(), eq(resourceLoader)))
                        .thenReturn(new Resource[] {bad});

                Assertions.assertThrows(
                        ServletException.class,
                        () -> {
                            mockMvc.perform(get("/sign")).andReturn();
                        });
            }
        }

        @Test
        @DisplayName("Ignores font resource without extension (no crash, filtered out)")
        void shouldIgnoreFontWithoutExtension() throws Exception {
            when(userService.getCurrentUsername()).thenReturn("bob");
            when(signatureService.getAvailableSignatures("bob"))
                    .thenReturn(Collections.emptyList());

            Resource noExt = mock(Resource.class);
            when(noExt.getFilename()).thenReturn("JustAName"); // no dot -> filtered out

            Resource good = mock(Resource.class);
            when(good.getFilename()).thenReturn("SomeFont.woff2");

            try (MockedStatic<GeneralUtils> gu = mockStatic(GeneralUtils.class);
                    MockedStatic<InstallationPathConfig> ipc =
                            mockStatic(InstallationPathConfig.class)) {

                ipc.when(InstallationPathConfig::getStaticPath).thenReturn("/opt/static/");

                gu.when(
                                () ->
                                        GeneralUtils.getResourcesFromLocationPattern(
                                                anyString(), eq(resourceLoader)))
                        .thenAnswer(
                                inv -> {
                                    String p = normalize(inv.getArgument(0, String.class));
                                    if (CLASSPATH_WOFF2.equals(p))
                                        return new Resource[] {noExt}; // ignored
                                    if (FILE_FONTS_GLOB.equals(p))
                                        return new Resource[] {good}; // kept
                                    return new Resource[0];
                                });

                var mvcResult =
                        mockMvc.perform(get("/sign"))
                                .andExpect(status().isOk())
                                .andExpect(view().name("sign"))
                                .andExpect(model().attribute("currentPage", "sign"))
                                .andReturn();

                Object fontsAttr = mvcResult.getModelAndView().getModel().get("fonts");
                Assertions.assertTrue(fontsAttr instanceof List<?>);
                List<?> fonts = (List<?>) fontsAttr;
                Assertions.assertEquals(1, fonts.size(), "Only the valid font should remain");
            }
        }
    }

    @Nested
    @DisplayName("/pipeline endpoint")
    class PipelineForm {

        @Test
        @DisplayName("Should load JSON configs from runtime path and infer names")
        void shouldLoadJsonConfigs() throws Exception {
            Path tempDir = Files.createTempDirectory("pipelines");
            Path a = tempDir.resolve("a.json");
            Path b = tempDir.resolve("b.json");
            Files.writeString(a, "{\"name\":\"Config A\",\"x\":1}", StandardCharsets.UTF_8);
            Files.writeString(b, "{\"y\":2}", StandardCharsets.UTF_8);

            when(runtimePathConfig.getPipelineDefaultWebUiConfigs()).thenReturn(tempDir.toString());

            var mvcResult =
                    mockMvc.perform(get("/pipeline"))
                            .andExpect(status().isOk())
                            .andExpect(view().name("pipeline"))
                            .andExpect(model().attribute("currentPage", "pipeline"))
                            .andExpect(
                                    model().attributeExists(
                                                    "pipelineConfigs", "pipelineConfigsWithNames"))
                            .andReturn();

            Map<String, Object> model = mvcResult.getModelAndView().getModel();
            @SuppressWarnings("unchecked")
            List<String> configsRaw = (List<String>) model.get("pipelineConfigs");
            @SuppressWarnings("unchecked")
            List<Map<String, String>> configsNamed =
                    (List<Map<String, String>>) model.get("pipelineConfigsWithNames");

            Assertions.assertEquals(2, configsRaw.size());
            Assertions.assertEquals(2, configsNamed.size());

            Set<String> names = new HashSet<>();
            for (Map<String, String> m : configsNamed) {
                names.add(m.get("name"));
                Assertions.assertTrue(configsRaw.contains(m.get("json")));
            }
            Assertions.assertTrue(names.contains("Config A"));
            Assertions.assertTrue(names.contains("b"));
        }

        @Test
        @DisplayName("Should fall back to default entry when Files.walk throws IOException")
        void shouldFallbackWhenWalkThrowsIOException() throws Exception {
            Path tempDir = Files.createTempDirectory("pipelines"); // exists() -> true
            when(runtimePathConfig.getPipelineDefaultWebUiConfigs()).thenReturn(tempDir.toString());

            try (MockedStatic<Files> files = mockStatic(Files.class)) {
                files.when(() -> Files.walk(any(Path.class)))
                        .thenThrow(new IOException("fail walk"));

                var mvcResult =
                        mockMvc.perform(get("/pipeline"))
                                .andExpect(status().isOk())
                                .andExpect(view().name("pipeline"))
                                .andExpect(model().attribute("currentPage", "pipeline"))
                                .andReturn();

                @SuppressWarnings("unchecked")
                List<Map<String, String>> configsNamed =
                        (List<Map<String, String>>)
                                mvcResult
                                        .getModelAndView()
                                        .getModel()
                                        .get("pipelineConfigsWithNames");

                Assertions.assertEquals(
                        1, configsNamed.size(), "Should add a default placeholder on IOException");
                Assertions.assertEquals(
                        "No preloaded configs found", configsNamed.get(0).get("name"));
                Assertions.assertEquals("", configsNamed.get(0).get("json"));
            }
        }
    }

    @Nested
    @DisplayName("getFormatFromExtension")
    class GetFormatFromExtension {

        @Test
        @DisplayName("Should return empty string for unknown extensions (default branch)")
        void shouldReturnDefaultForUnknown() {
            Assertions.assertEquals("", controller.getFormatFromExtension("otf"));
            Assertions.assertEquals("", controller.getFormatFromExtension("unknown"));
        }

        @Test
        @DisplayName("Known extensions should map correctly")
        void shouldMapKnownExtensions() {
            Assertions.assertEquals("truetype", controller.getFormatFromExtension("ttf"));
            Assertions.assertEquals("woff", controller.getFormatFromExtension("woff"));
            Assertions.assertEquals("woff2", controller.getFormatFromExtension("woff2"));
            Assertions.assertEquals("embedded-opentype", controller.getFormatFromExtension("eot"));
            Assertions.assertEquals("svg", controller.getFormatFromExtension("svg"));
        }
    }
}
