package stirling.software.SPDF.controller.web;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.stream.Stream;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.InstallationPathConfig;
import stirling.software.SPDF.config.RuntimePathConfig;
import stirling.software.SPDF.controller.api.pipeline.UserServiceInterface;
import stirling.software.SPDF.model.SignatureFile;
import stirling.software.SPDF.service.SignatureService;
import stirling.software.SPDF.utils.GeneralUtils;

@Controller
@Tag(name = "General", description = "General APIs")
@Slf4j
public class GeneralWebController {

    private final SignatureService signatureService;
    private final UserServiceInterface userService;
    private final ResourceLoader resourceLoader;
    private final RuntimePathConfig runtimePathConfig;

    public GeneralWebController(
            SignatureService signatureService,
            @Autowired(required = false) UserServiceInterface userService,
            ResourceLoader resourceLoader,
            RuntimePathConfig runtimePathConfig) {
        this.signatureService = signatureService;
        this.userService = userService;
        this.resourceLoader = resourceLoader;
        this.runtimePathConfig = runtimePathConfig;
    }

    @GetMapping("/pipeline")
    @Hidden
    public String pipelineForm(Model model) {
        model.addAttribute("currentPage", "pipeline");
        List<String> pipelineConfigs = new ArrayList<>();
        List<Map<String, String>> pipelineConfigsWithNames = new ArrayList<>();
        if (new File(runtimePathConfig.getPipelineDefaultWebUiConfigs()).exists()) {
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
                log.error("exception", e);
            }
        }
        if (pipelineConfigsWithNames.size() == 0) {
            Map<String, String> configWithName = new HashMap<>();
            configWithName.put("json", "");
            configWithName.put("name", "No preloaded configs found");
            pipelineConfigsWithNames.add(configWithName);
        }
        model.addAttribute("pipelineConfigsWithNames", pipelineConfigsWithNames);
        model.addAttribute("pipelineConfigs", pipelineConfigs);
        return "pipeline";
    }

    @GetMapping("/merge-pdfs")
    @Hidden
    public String mergePdfForm(Model model) {
        model.addAttribute("currentPage", "merge-pdfs");
        return "merge-pdfs";
    }

    @GetMapping("/split-pdf-by-sections")
    @Hidden
    public String splitPdfBySections(Model model) {
        model.addAttribute("currentPage", "split-pdf-by-sections");
        return "split-pdf-by-sections";
    }

    @GetMapping("/split-pdf-by-chapters")
    @Hidden
    public String splitPdfByChapters(Model model) {
        model.addAttribute("currentPage", "split-pdf-by-chapters");
        return "split-pdf-by-chapters";
    }

    @GetMapping("/view-pdf")
    @Hidden
    public String ViewPdfForm2(Model model) {
        model.addAttribute("currentPage", "view-pdf");
        return "view-pdf";
    }

    @GetMapping("/multi-tool")
    @Hidden
    public String multiToolForm(Model model) {
        model.addAttribute("currentPage", "multi-tool");
        return "multi-tool";
    }

    @GetMapping("/remove-pages")
    @Hidden
    public String pageDeleter(Model model) {
        model.addAttribute("currentPage", "remove-pages");
        return "remove-pages";
    }

    @GetMapping("/pdf-organizer")
    @Hidden
    public String pageOrganizer(Model model) {
        model.addAttribute("currentPage", "pdf-organizer");
        return "pdf-organizer";
    }

    @GetMapping("/extract-page")
    @Hidden
    public String extractPages(Model model) {
        model.addAttribute("currentPage", "extract-page");
        return "extract-page";
    }

    @GetMapping("/pdf-to-single-page")
    @Hidden
    public String pdfToSinglePage(Model model) {
        model.addAttribute("currentPage", "pdf-to-single-page");
        return "pdf-to-single-page";
    }

    @GetMapping("/rotate-pdf")
    @Hidden
    public String rotatePdfForm(Model model) {
        model.addAttribute("currentPage", "rotate-pdf");
        return "rotate-pdf";
    }

    @GetMapping("/split-pdfs")
    @Hidden
    public String splitPdfForm(Model model) {
        model.addAttribute("currentPage", "split-pdfs");
        return "split-pdfs";
    }

    @GetMapping("/sign")
    @Hidden
    public String signForm(Model model) {
        String username = "";
        if (userService != null) {
            username = userService.getCurrentUsername();
        }
        // Get signatures from both personal and ALL_USERS folders
        List<SignatureFile> signatures = signatureService.getAvailableSignatures(username);
        model.addAttribute("currentPage", "sign");
        model.addAttribute("fonts", getFontNames());
        model.addAttribute("signatures", signatures);
        return "sign";
    }

    @GetMapping("/multi-page-layout")
    @Hidden
    public String multiPageLayoutForm(Model model) {
        model.addAttribute("currentPage", "multi-page-layout");
        return "multi-page-layout";
    }

    @GetMapping("/scale-pages")
    @Hidden
    public String scalePagesFrom(Model model) {
        model.addAttribute("currentPage", "scale-pages");
        return "scale-pages";
    }

    @GetMapping("/split-by-size-or-count")
    @Hidden
    public String splitBySizeOrCount(Model model) {
        model.addAttribute("currentPage", "split-by-size-or-count");
        return "split-by-size-or-count";
    }

    @GetMapping("/overlay-pdf")
    @Hidden
    public String overlayPdf(Model model) {
        model.addAttribute("currentPage", "overlay-pdf");
        return "overlay-pdf";
    }

    private List<FontResource> getFontNames() {
        List<FontResource> fontNames = new ArrayList<>();
        // Extract font names from classpath
        fontNames.addAll(getFontNamesFromLocation("classpath:static/fonts/*.woff2"));
        // Extract font names from external directory
        fontNames.addAll(
                getFontNamesFromLocation(
                        "file:"
                                + InstallationPathConfig.getStaticPath()
                                + "fonts"
                                + File.separator
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
                                    throw new RuntimeException("Error processing filename", e);
                                }
                            })
                    .filter(Objects::nonNull)
                    .toList();
        } catch (Exception e) {
            throw new RuntimeException("Failed to read font directory from " + locationPattern, e);
        }
    }

    public String getFormatFromExtension(String extension) {
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
                // or throw an exception if an unexpected extension is encountered
                return "";
        }
    }

    @GetMapping("/crop")
    @Hidden
    public String cropForm(Model model) {
        model.addAttribute("currentPage", "crop");
        return "crop";
    }

    @GetMapping("/auto-split-pdf")
    @Hidden
    public String autoSPlitPDFForm(Model model) {
        model.addAttribute("currentPage", "auto-split-pdf");
        return "auto-split-pdf";
    }

    @GetMapping("/remove-image-pdf")
    @Hidden
    public String removeImagePdfForm(Model model) {
        model.addAttribute("currentPage", "remove-image-pdf");
        return "remove-image-pdf";
    }

    public class FontResource {

        private String name;

        private String extension;

        private String type;

        public FontResource(String name, String extension) {
            this.name = name;
            this.extension = extension;
            this.type = getFormatFromExtension(extension);
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getExtension() {
            return extension;
        }

        public void setExtension(String extension) {
            this.extension = extension;
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }
    }
}
