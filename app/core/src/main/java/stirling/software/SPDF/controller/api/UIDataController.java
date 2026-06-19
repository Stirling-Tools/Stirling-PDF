package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Stream;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.core.Response;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.Dependency;
import stirling.software.SPDF.model.SignatureFile;
import stirling.software.SPDF.service.SharedSignatureService;
import stirling.software.common.annotations.api.UiDataApi;
import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.io.ClassPathResource;
import stirling.software.common.model.io.Resource;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@UiDataApi
@ApplicationScoped
@jakarta.ws.rs.Path("/api/v1/ui-data")
public class UIDataController {

    private final ApplicationProperties applicationProperties;
    private final SharedSignatureService signatureService;
    // @Autowired(required = false) -> optional CDI dependency via Instance<T>.
    private final Instance<UserServiceInterface> userService;
    private final RuntimePathConfig runtimePathConfig;
    private final ObjectMapper objectMapper;

    public UIDataController(
            ApplicationProperties applicationProperties,
            SharedSignatureService signatureService,
            Instance<UserServiceInterface> userService,
            RuntimePathConfig runtimePathConfig,
            ObjectMapper objectMapper) {
        this.applicationProperties = applicationProperties;
        this.signatureService = signatureService;
        this.userService = userService;
        this.runtimePathConfig = runtimePathConfig;
        this.objectMapper = objectMapper;
    }

    @GET
    @jakarta.ws.rs.Path("/footer-info")
    @Operation(summary = "Get public footer configuration data")
    public Response getFooterData() {
        FooterData data = new FooterData();
        data.setAnalyticsEnabled(applicationProperties.getSystem().getEnableAnalytics());
        data.setTermsAndConditions(applicationProperties.getLegal().getTermsAndConditions());
        data.setPrivacyPolicy(applicationProperties.getLegal().getPrivacyPolicy());
        data.setAccessibilityStatement(
                applicationProperties.getLegal().getAccessibilityStatement());
        data.setCookiePolicy(applicationProperties.getLegal().getCookiePolicy());
        data.setImpressum(applicationProperties.getLegal().getImpressum());

        return Response.ok(data).build();
    }

    @GET
    @jakarta.ws.rs.Path("/home")
    @Operation(summary = "Get home page data")
    public Response getHomeData() {
        String showSurvey = System.getenv("SHOW_SURVEY");
        boolean showSurveyValue = showSurvey == null || "true".equalsIgnoreCase(showSurvey);

        HomeData data = new HomeData();
        data.setShowSurveyFromDocker(showSurveyValue);

        return Response.ok(data).build();
    }

    @GET
    @jakarta.ws.rs.Path("/licenses")
    @Operation(summary = "Get third-party licenses data")
    public Response getLicensesData() {
        LicensesData data = new LicensesData();
        Resource resource = new ClassPathResource("static/3rdPartyLicenses.json");

        try (InputStream is = resource.getInputStream()) {
            Map<String, List<Dependency>> licenseData =
                    objectMapper.readValue(is, new TypeReference<>() {});
            data.setDependencies(licenseData.get("dependencies"));
        } catch (IOException e) {
            log.error("Failed to load licenses data", e);
            data.setDependencies(Collections.emptyList());
        }

        return Response.ok(data).build();
    }

    @GET
    @jakarta.ws.rs.Path("/pipeline")
    @Operation(summary = "Get pipeline configuration data")
    public Response getPipelineData() {
        PipelineData data = new PipelineData();
        List<String> pipelineConfigs = new ArrayList<>();
        List<Map<String, String>> pipelineConfigsWithNames = new ArrayList<>();

        if (new java.io.File(runtimePathConfig.getPipelineDefaultWebUiConfigs()).exists()) {
            try (Stream<Path> paths =
                    Files.walk(Path.of(runtimePathConfig.getPipelineDefaultWebUiConfigs()))) {
                List<Path> jsonFiles =
                        paths.filter(Files::isRegularFile)
                                .filter(p -> p.toString().endsWith(".json"))
                                .toList();

                for (Path jsonFile : jsonFiles) {
                    String content = Files.readString(jsonFile, StandardCharsets.UTF_8);
                    pipelineConfigs.add(content);
                }

                for (String config : pipelineConfigs) {
                    Map<String, Object> jsonContent =
                            objectMapper.readValue(
                                    config, new TypeReference<Map<String, Object>>() {});
                    String name = (String) jsonContent.get("name");
                    if (name == null || name.length() < 1) {
                        String filename =
                                jsonFiles
                                        .get(pipelineConfigs.indexOf(config))
                                        .getFileName()
                                        .toString();
                        name = filename.substring(0, filename.lastIndexOf('.'));
                    }
                    Map<String, String> configWithName = new HashMap<>();
                    configWithName.put("json", config);
                    configWithName.put("name", name);
                    pipelineConfigsWithNames.add(configWithName);
                }
            } catch (IOException e) {
                log.error("Failed to load pipeline configs", e);
            }
        }

        if (pipelineConfigsWithNames.isEmpty()) {
            Map<String, String> configWithName = new HashMap<>();
            configWithName.put("json", "");
            configWithName.put("name", "No preloaded configs found");
            pipelineConfigsWithNames.add(configWithName);
        }

        data.setPipelineConfigsWithNames(pipelineConfigsWithNames);
        data.setPipelineConfigs(pipelineConfigs);

        return Response.ok(data).build();
    }

    @GET
    @jakarta.ws.rs.Path("/sign")
    @Operation(summary = "Get signature form data")
    public Response getSignData() {
        String username = "";
        if (userService != null && userService.isResolvable()) {
            username = userService.get().getCurrentUsername();
        }

        List<SignatureFile> signatures = signatureService.getAvailableSignatures(username);
        List<FontResource> fonts = getFontNames();

        SignData data = new SignData();
        data.setSignatures(signatures);
        data.setFonts(fonts);

        return Response.ok(data).build();
    }

    @GET
    @jakarta.ws.rs.Path("/ocr-pdf")
    @Operation(summary = "Get OCR PDF data")
    public Response getOcrPdfData() {
        List<String> languages = getAvailableTesseractLanguages();

        OcrData data = new OcrData();
        data.setLanguages(languages);

        return Response.ok(data).build();
    }

    private List<String> getAvailableTesseractLanguages() {
        String tessdataDir = runtimePathConfig.getTessDataPath();
        java.io.File[] files = new java.io.File(tessdataDir).listFiles();
        if (files == null) {
            return Collections.emptyList();
        }
        return Arrays.stream(files)
                .filter(file -> file.getName().endsWith(".traineddata"))
                .map(file -> file.getName().replace(".traineddata", ""))
                .filter(lang -> !"osd".equalsIgnoreCase(lang))
                .sorted()
                .toList();
    }

    private List<FontResource> getFontNames() {
        List<FontResource> fontNames = new ArrayList<>();
        fontNames.addAll(getFontNamesFromLocation("classpath:static/fonts/*.woff2"));
        fontNames.addAll(
                getFontNamesFromLocation(
                        "file:"
                                + InstallationPathConfig.getStaticPath()
                                + "fonts"
                                + java.io.File.separator
                                + "*"));
        return fontNames;
    }

    private List<FontResource> getFontNamesFromLocation(String locationPattern) {
        try {
            Resource[] resources = GeneralUtils.getResourcesFromLocationPattern(locationPattern);
            return Arrays.stream(resources)
                    .map(
                            resource -> {
                                try {
                                    String filename = resource.getFilename();
                                    if (filename != null) {
                                        int lastDotIndex = filename.lastIndexOf('.');
                                        if (lastDotIndex != -1) {
                                            String name = filename.substring(0, lastDotIndex);
                                            String extension = filename.substring(lastDotIndex + 1);
                                            return new FontResource(name, extension);
                                        }
                                    }
                                    return null;
                                } catch (Exception e) {
                                    throw ExceptionUtils.createRuntimeException(
                                            "error.fontLoadingFailed",
                                            "Error processing font file",
                                            e);
                                }
                            })
                    .filter(Objects::nonNull)
                    .toList();
        } catch (Exception e) {
            throw ExceptionUtils.createRuntimeException(
                    "error.fontDirectoryReadFailed", "Failed to read font directory", e);
        }
    }

    // Data classes
    @Data
    public static class FooterData {
        private Boolean analyticsEnabled;
        private String termsAndConditions;
        private String privacyPolicy;
        private String accessibilityStatement;
        private String cookiePolicy;
        private String impressum;
    }

    @Data
    public static class HomeData {
        private boolean showSurveyFromDocker;
    }

    @Data
    public static class LicensesData {
        private List<Dependency> dependencies;
    }

    @Data
    public static class PipelineData {
        private List<Map<String, String>> pipelineConfigsWithNames;
        private List<String> pipelineConfigs;
    }

    @Data
    public static class SignData {
        private List<SignatureFile> signatures;
        private List<FontResource> fonts;
    }

    @Data
    public static class OcrData {
        private List<String> languages;
    }

    @Data
    public static class FontResource {
        private String name;
        private String extension;
        private String type;

        public FontResource(String name, String extension) {
            this.name = name;
            this.extension = extension;
            this.type = getFormatFromExtension(extension);
        }

        private static String getFormatFromExtension(String extension) {
            switch (extension) {
                case "ttf":
                    return "truetype";
                case "woff":
                    return "woff";
                case "woff2":
                    return "woff2";
                case "eot":
                    return "embedded-opentype";
                case "svg":
                    return "svg";
                default:
                    return "";
            }
        }
    }
}
