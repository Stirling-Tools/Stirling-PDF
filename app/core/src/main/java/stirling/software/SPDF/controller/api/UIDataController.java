package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.stream.Stream;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.Dependency;
import stirling.software.SPDF.model.SignatureFile;
import stirling.software.SPDF.service.SignatureService;
import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;

@Slf4j
@RestController
@RequestMapping("/api/v1/ui-data")
@Tag(name = "UI Data", description = "APIs for React UI data")
@RequiredArgsConstructor
public class UIDataController {

    private final ApplicationProperties applicationProperties;
    private final SignatureService signatureService;
    private final UserServiceInterface userService;
    private final ResourceLoader resourceLoader;
    private final RuntimePathConfig runtimePathConfig;

    @GetMapping("/home")
    @Operation(summary = "Get home page data")
    public ResponseEntity<HomeData> getHomeData() {
        String showSurvey = System.getenv("SHOW_SURVEY");
        boolean showSurveyValue = showSurvey == null || "true".equalsIgnoreCase(showSurvey);

        HomeData data = new HomeData();
        data.setShowSurveyFromDocker(showSurveyValue);

        return ResponseEntity.ok(data);
    }

    @GetMapping("/licenses")
    @Operation(summary = "Get third-party licenses data")
    public ResponseEntity<LicensesData> getLicensesData() {
        LicensesData data = new LicensesData();
        Resource resource = new ClassPathResource("static/3rdPartyLicenses.json");

        try {
            InputStream is = resource.getInputStream();
            String json = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            ObjectMapper mapper = new ObjectMapper();
            Map<String, List<Dependency>> licenseData =
                    mapper.readValue(json, new TypeReference<>() {});
            data.setDependencies(licenseData.get("dependencies"));
        } catch (IOException e) {
            log.error("Failed to load licenses data", e);
            data.setDependencies(Collections.emptyList());
        }

        return ResponseEntity.ok(data);
    }

    @GetMapping("/pipeline")
    @Operation(summary = "Get pipeline configuration data")
    public ResponseEntity<PipelineData> getPipelineData() {
        PipelineData data = new PipelineData();
        List<String> pipelineConfigs = new ArrayList<>();
        List<Map<String, String>> pipelineConfigsWithNames = new ArrayList<>();

        if (new java.io.File(runtimePathConfig.getPipelineDefaultWebUiConfigs()).exists()) {
            try (Stream<Path> paths =
                    Files.walk(Paths.get(runtimePathConfig.getPipelineDefaultWebUiConfigs()))) {
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
                            new ObjectMapper()
                                    .readValue(config, new TypeReference<Map<String, Object>>() {});
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

        return ResponseEntity.ok(data);
    }

    @GetMapping("/sign")
    @Operation(summary = "Get signature form data")
    public ResponseEntity<SignData> getSignData() {
        String username = "";
        if (userService != null) {
            username = userService.getCurrentUsername();
        }

        List<SignatureFile> signatures = signatureService.getAvailableSignatures(username);
        List<FontResource> fonts = getFontNames();

        SignData data = new SignData();
        data.setSignatures(signatures);
        data.setFonts(fonts);

        return ResponseEntity.ok(data);
    }

    @GetMapping("/ocr-pdf")
    @Operation(summary = "Get OCR PDF data")
    public ResponseEntity<OcrData> getOcrPdfData() {
        List<String> languages = getAvailableTesseractLanguages();

        OcrData data = new OcrData();
        data.setLanguages(languages);

        return ResponseEntity.ok(data);
    }

    private List<String> getAvailableTesseractLanguages() {
        String tessdataDir = applicationProperties.getSystem().getTessdataDir();
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
            Resource[] resources =
                    GeneralUtils.getResourcesFromLocationPattern(locationPattern, resourceLoader);
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
