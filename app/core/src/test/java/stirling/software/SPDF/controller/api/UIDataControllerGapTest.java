package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.core.io.ResourceLoader;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import stirling.software.SPDF.model.Dependency;
import stirling.software.SPDF.model.SignatureFile;
import stirling.software.SPDF.service.SharedSignatureService;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UIDataControllerGapTest {

    @Mock private ApplicationProperties applicationProperties;
    @Mock private ApplicationProperties.System system;
    @Mock private ApplicationProperties.Legal legal;
    @Mock private SharedSignatureService signatureService;
    @Mock private UserServiceInterface userService;
    @Mock private RuntimePathConfig runtimePathConfig;

    private final ResourceLoader resourceLoader = new DefaultResourceLoader();
    private final ObjectMapper objectMapper = JsonMapper.builder().build();

    private UIDataController controller(UserServiceInterface user) {
        return new UIDataController(
                applicationProperties,
                signatureService,
                user,
                resourceLoader,
                runtimePathConfig,
                objectMapper);
    }

    @BeforeEach
    void setUp() {
        lenient().when(applicationProperties.getSystem()).thenReturn(system);
        lenient().when(applicationProperties.getLegal()).thenReturn(legal);
    }

    @Nested
    @DisplayName("getFooterData")
    class FooterData {

        @Test
        @DisplayName("maps all legal and analytics fields onto the response body")
        void mapsAllFields() {
            when(system.getEnableAnalytics()).thenReturn(Boolean.TRUE);
            when(legal.getTermsAndConditions()).thenReturn("https://terms");
            when(legal.getPrivacyPolicy()).thenReturn("https://privacy");
            when(legal.getAccessibilityStatement()).thenReturn("https://a11y");
            when(legal.getCookiePolicy()).thenReturn("https://cookies");
            when(legal.getImpressum()).thenReturn("https://impressum");

            ResponseEntity<UIDataController.FooterData> response =
                    controller(userService).getFooterData();

            assertEquals(HttpStatus.OK, response.getStatusCode());
            UIDataController.FooterData body = response.getBody();
            assertNotNull(body);
            assertEquals(Boolean.TRUE, body.getAnalyticsEnabled());
            assertEquals("https://terms", body.getTermsAndConditions());
            assertEquals("https://privacy", body.getPrivacyPolicy());
            assertEquals("https://a11y", body.getAccessibilityStatement());
            assertEquals("https://cookies", body.getCookiePolicy());
            assertEquals("https://impressum", body.getImpressum());
        }

        @Test
        @DisplayName("propagates null/false values from configuration")
        void handlesNulls() {
            when(system.getEnableAnalytics()).thenReturn(Boolean.FALSE);
            when(legal.getTermsAndConditions()).thenReturn(null);
            when(legal.getPrivacyPolicy()).thenReturn(null);
            when(legal.getAccessibilityStatement()).thenReturn(null);
            when(legal.getCookiePolicy()).thenReturn(null);
            when(legal.getImpressum()).thenReturn(null);

            ResponseEntity<UIDataController.FooterData> response =
                    controller(userService).getFooterData();

            assertEquals(HttpStatus.OK, response.getStatusCode());
            UIDataController.FooterData body = response.getBody();
            assertNotNull(body);
            assertEquals(Boolean.FALSE, body.getAnalyticsEnabled());
            assertNull(body.getTermsAndConditions());
            assertNull(body.getPrivacyPolicy());
            assertNull(body.getAccessibilityStatement());
            assertNull(body.getCookiePolicy());
            assertNull(body.getImpressum());
        }
    }

    @Nested
    @DisplayName("getHomeData")
    class HomeData {

        @Test
        @DisplayName("returns OK with a populated body regardless of survey env var")
        void returnsOk() {
            ResponseEntity<UIDataController.HomeData> response =
                    controller(userService).getHomeData();

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            // SHOW_SURVEY is unset in the test JVM, so the default (true) applies.
            assertTrue(response.getBody().isShowSurveyFromDocker());
        }
    }

    @Nested
    @DisplayName("getLicensesData")
    class LicensesData {

        @Test
        @DisplayName("loads the bundled 3rdPartyLicenses.json from the classpath")
        void loadsDependencies() {
            ResponseEntity<UIDataController.LicensesData> response =
                    controller(userService).getLicensesData();

            assertEquals(HttpStatus.OK, response.getStatusCode());
            UIDataController.LicensesData body = response.getBody();
            assertNotNull(body);
            List<Dependency> deps = body.getDependencies();
            assertNotNull(deps);
            assertFalse(deps.isEmpty());
            // Each parsed dependency should at least carry a module name.
            assertNotNull(deps.get(0).getModuleName());
        }
    }

    @Nested
    @DisplayName("getPipelineData")
    class PipelineData {

        @Test
        @DisplayName("returns the placeholder entry when the config directory is missing")
        void missingDirectoryYieldsPlaceholder() {
            String missing = Path.of("nonexistent-pipeline-dir-" + UUID.randomUUID()).toString();
            when(runtimePathConfig.getPipelineDefaultWebUiConfigs()).thenReturn(missing);

            ResponseEntity<UIDataController.PipelineData> response =
                    controller(userService).getPipelineData();

            assertEquals(HttpStatus.OK, response.getStatusCode());
            UIDataController.PipelineData body = response.getBody();
            assertNotNull(body);
            assertTrue(body.getPipelineConfigs().isEmpty());
            assertEquals(1, body.getPipelineConfigsWithNames().size());
            Map<String, String> placeholder = body.getPipelineConfigsWithNames().get(0);
            assertEquals("", placeholder.get("json"));
            assertEquals("No preloaded configs found", placeholder.get("name"));
        }

        @Test
        @DisplayName("uses the embedded name field when present")
        void readsConfigWithName(@TempDir Path dir) throws Exception {
            Files.writeString(
                    dir.resolve("config1.json"),
                    "{\"name\":\"My Pipeline\",\"operations\":[]}",
                    StandardCharsets.UTF_8);
            when(runtimePathConfig.getPipelineDefaultWebUiConfigs()).thenReturn(dir.toString());

            ResponseEntity<UIDataController.PipelineData> response =
                    controller(userService).getPipelineData();

            assertEquals(HttpStatus.OK, response.getStatusCode());
            UIDataController.PipelineData body = response.getBody();
            assertNotNull(body);
            assertEquals(1, body.getPipelineConfigs().size());
            assertEquals(1, body.getPipelineConfigsWithNames().size());
            assertEquals("My Pipeline", body.getPipelineConfigsWithNames().get(0).get("name"));
            assertTrue(
                    body.getPipelineConfigsWithNames().get(0).get("json").contains("My Pipeline"));
        }

        @Test
        @DisplayName("falls back to the filename (sans extension) when name is missing")
        void fallsBackToFilenameWhenNameMissing(@TempDir Path dir) throws Exception {
            Files.writeString(
                    dir.resolve("fallback-name.json"),
                    "{\"operations\":[]}",
                    StandardCharsets.UTF_8);
            when(runtimePathConfig.getPipelineDefaultWebUiConfigs()).thenReturn(dir.toString());

            ResponseEntity<UIDataController.PipelineData> response =
                    controller(userService).getPipelineData();

            assertEquals(HttpStatus.OK, response.getStatusCode());
            UIDataController.PipelineData body = response.getBody();
            assertNotNull(body);
            assertEquals(1, body.getPipelineConfigsWithNames().size());
            assertEquals("fallback-name", body.getPipelineConfigsWithNames().get(0).get("name"));
        }

        @Test
        @DisplayName("falls back to the filename when name is blank")
        void fallsBackToFilenameWhenNameBlank(@TempDir Path dir) throws Exception {
            Files.writeString(
                    dir.resolve("blank-name.json"),
                    "{\"name\":\"\",\"operations\":[]}",
                    StandardCharsets.UTF_8);
            when(runtimePathConfig.getPipelineDefaultWebUiConfigs()).thenReturn(dir.toString());

            ResponseEntity<UIDataController.PipelineData> response =
                    controller(userService).getPipelineData();

            UIDataController.PipelineData body = response.getBody();
            assertNotNull(body);
            assertEquals("blank-name", body.getPipelineConfigsWithNames().get(0).get("name"));
        }

        @Test
        @DisplayName("ignores non-json files in the config directory")
        void ignoresNonJsonFiles(@TempDir Path dir) throws Exception {
            Files.writeString(dir.resolve("notes.txt"), "ignore me", StandardCharsets.UTF_8);
            Files.writeString(
                    dir.resolve("real.json"), "{\"name\":\"Real\"}", StandardCharsets.UTF_8);
            when(runtimePathConfig.getPipelineDefaultWebUiConfigs()).thenReturn(dir.toString());

            ResponseEntity<UIDataController.PipelineData> response =
                    controller(userService).getPipelineData();

            UIDataController.PipelineData body = response.getBody();
            assertNotNull(body);
            assertEquals(1, body.getPipelineConfigs().size());
            assertEquals(1, body.getPipelineConfigsWithNames().size());
            assertEquals("Real", body.getPipelineConfigsWithNames().get(0).get("name"));
        }

        @Test
        @DisplayName("returns the placeholder when the directory exists but holds no json")
        void emptyDirectoryYieldsPlaceholder(@TempDir Path dir) {
            when(runtimePathConfig.getPipelineDefaultWebUiConfigs()).thenReturn(dir.toString());

            ResponseEntity<UIDataController.PipelineData> response =
                    controller(userService).getPipelineData();

            UIDataController.PipelineData body = response.getBody();
            assertNotNull(body);
            assertTrue(body.getPipelineConfigs().isEmpty());
            assertEquals(1, body.getPipelineConfigsWithNames().size());
            assertEquals(
                    "No preloaded configs found",
                    body.getPipelineConfigsWithNames().get(0).get("name"));
        }
    }

    @Nested
    @DisplayName("getSignData")
    class SignData {

        @Test
        @DisplayName("uses the current username from the user service to fetch signatures")
        void usesUsernameFromUserService() {
            when(userService.getCurrentUsername()).thenReturn("alice");
            List<SignatureFile> sigs = List.of(new SignatureFile("sig.png", "Personal"));
            when(signatureService.getAvailableSignatures("alice")).thenReturn(sigs);

            ResponseEntity<UIDataController.SignData> response =
                    controller(userService).getSignData();

            assertEquals(HttpStatus.OK, response.getStatusCode());
            UIDataController.SignData body = response.getBody();
            assertNotNull(body);
            assertEquals(sigs, body.getSignatures());
            // Fonts come from the real resource loader; the list is never null.
            assertNotNull(body.getFonts());
            verify(userService).getCurrentUsername();
            verify(signatureService).getAvailableSignatures("alice");
        }

        @Test
        @DisplayName("falls back to an empty username when no user service is wired")
        void nullUserServiceUsesEmptyUsername() {
            when(signatureService.getAvailableSignatures("")).thenReturn(List.of());

            ResponseEntity<UIDataController.SignData> response = controller(null).getSignData();

            assertEquals(HttpStatus.OK, response.getStatusCode());
            UIDataController.SignData body = response.getBody();
            assertNotNull(body);
            assertNotNull(body.getSignatures());
            assertNotNull(body.getFonts());
            verify(signatureService).getAvailableSignatures("");
        }
    }

    @Nested
    @DisplayName("getOcrPdfData")
    class OcrData {

        @Test
        @DisplayName("returns an empty language list when the tessdata directory is absent")
        void absentTessdataDirYieldsEmptyList() {
            when(runtimePathConfig.getTessDataPath())
                    .thenReturn(Path.of("nonexistent-tessdata-" + UUID.randomUUID()).toString());

            ResponseEntity<UIDataController.OcrData> response =
                    controller(userService).getOcrPdfData();

            assertEquals(HttpStatus.OK, response.getStatusCode());
            UIDataController.OcrData body = response.getBody();
            assertNotNull(body);
            assertNotNull(body.getLanguages());
            assertTrue(body.getLanguages().isEmpty());
        }

        @Test
        @DisplayName("lists trained languages, excludes osd, and sorts alphabetically")
        void listsAndSortsTrainedLanguages(@TempDir Path dir) throws Exception {
            Files.writeString(dir.resolve("eng.traineddata"), "x", StandardCharsets.UTF_8);
            Files.writeString(dir.resolve("deu.traineddata"), "x", StandardCharsets.UTF_8);
            Files.writeString(dir.resolve("osd.traineddata"), "x", StandardCharsets.UTF_8);
            // Non-traineddata files must be ignored.
            Files.writeString(dir.resolve("readme.txt"), "x", StandardCharsets.UTF_8);
            when(runtimePathConfig.getTessDataPath()).thenReturn(dir.toString());

            ResponseEntity<UIDataController.OcrData> response =
                    controller(userService).getOcrPdfData();

            assertEquals(HttpStatus.OK, response.getStatusCode());
            UIDataController.OcrData body = response.getBody();
            assertNotNull(body);
            // osd filtered out; remaining sorted alphabetically.
            assertEquals(List.of("deu", "eng"), body.getLanguages());
        }

        @Test
        @DisplayName("excludes osd case-insensitively")
        void excludesOsdCaseInsensitively(@TempDir Path dir) throws Exception {
            Files.writeString(dir.resolve("OSD.traineddata"), "x", StandardCharsets.UTF_8);
            Files.writeString(dir.resolve("fra.traineddata"), "x", StandardCharsets.UTF_8);
            when(runtimePathConfig.getTessDataPath()).thenReturn(dir.toString());

            ResponseEntity<UIDataController.OcrData> response =
                    controller(userService).getOcrPdfData();

            UIDataController.OcrData body = response.getBody();
            assertNotNull(body);
            assertEquals(List.of("fra"), body.getLanguages());
            assertFalse(body.getLanguages().contains("OSD"));
        }
    }

    @Nested
    @DisplayName("FontResource format mapping")
    class FontResourceMapping {

        @Test
        @DisplayName("maps known extensions to their CSS font-format strings")
        void mapsKnownExtensions() {
            assertEquals("truetype", new UIDataController.FontResource("Arial", "ttf").getType());
            assertEquals("woff", new UIDataController.FontResource("Arial", "woff").getType());
            assertEquals("woff2", new UIDataController.FontResource("Arial", "woff2").getType());
            assertEquals(
                    "embedded-opentype",
                    new UIDataController.FontResource("Arial", "eot").getType());
            assertEquals("svg", new UIDataController.FontResource("Arial", "svg").getType());
        }

        @Test
        @DisplayName("maps unknown extensions to an empty type and preserves name/extension")
        void mapsUnknownExtensionToEmpty() {
            UIDataController.FontResource resource =
                    new UIDataController.FontResource("Arial", "otf");
            assertEquals("", resource.getType());
            assertEquals("Arial", resource.getName());
            assertEquals("otf", resource.getExtension());
        }
    }

    @Nested
    @DisplayName("Cross-cutting behaviour")
    class CrossCutting {

        @Test
        @DisplayName("getFooterData never touches the signature or user services")
        void footerDataIsIndependentOfUserState() {
            when(system.getEnableAnalytics()).thenReturn(null);

            controller(userService).getFooterData();

            verify(signatureService, never())
                    .getAvailableSignatures(org.mockito.ArgumentMatchers.anyString());
            verify(userService, never()).getCurrentUsername();
        }
    }
}
