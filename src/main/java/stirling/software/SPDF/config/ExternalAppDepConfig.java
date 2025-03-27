package stirling.software.SPDF.config;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

@Configuration
@Slf4j
public class ExternalAppDepConfig {

    private final EndpointConfiguration endpointConfiguration;

    private final String weasyprintPath;
    private final String unoconvPath;
    private final Map<String, List<String>> commandToGroupMapping;

    public ExternalAppDepConfig(
            EndpointConfiguration endpointConfiguration, RuntimePathConfig runtimePathConfig) {
        this.endpointConfiguration = endpointConfiguration;
        weasyprintPath = runtimePathConfig.getWeasyPrintPath();
        unoconvPath = runtimePathConfig.getUnoConvertPath();

        commandToGroupMapping =
                new HashMap<>() {

                    {
                        put("soffice", List.of("LibreOffice"));
                        put(weasyprintPath, List.of("Weasyprint"));
                        put("pdftohtml", List.of("Pdftohtml"));
                        put(unoconvPath, List.of("Unoconvert"));
                        put("qpdf", List.of("qpdf"));
                        put("tesseract", List.of("tesseract"));
                    }
                };
    }

    private boolean isCommandAvailable(String command) {
        try {
            ProcessBuilder processBuilder = new ProcessBuilder();
            if (System.getProperty("os.name").toLowerCase().contains("windows")) {
                processBuilder.command("where", command);
            } else {
                processBuilder.command("which", command);
            }
            Process process = processBuilder.start();
            int exitCode = process.waitFor();
            return exitCode == 0;
        } catch (Exception e) {
            log.debug("Error checking for command {}: {}", command, e.getMessage());
            return false;
        }
    }

    private List<String> getAffectedFeatures(String group) {
        return endpointConfiguration.getEndpointsForGroup(group).stream()
                .map(endpoint -> formatEndpointAsFeature(endpoint))
                .toList();
    }

    private String formatEndpointAsFeature(String endpoint) {
        // First replace common terms
        String feature = endpoint.replace("-", " ").replace("pdf", "PDF").replace("img", "image");
        // Split into words and capitalize each word
        return Arrays.stream(feature.split("\\s+"))
                .map(word -> capitalizeWord(word))
                .collect(Collectors.joining(" "));
    }

    private String capitalizeWord(String word) {
        if (word.isEmpty()) {
            return word;
        }
        if ("pdf".equalsIgnoreCase(word)) {
            return "PDF";
        }
        return word.substring(0, 1).toUpperCase() + word.substring(1).toLowerCase();
    }

    private void checkDependencyAndDisableGroup(String command) {
        boolean isAvailable = isCommandAvailable(command);
        if (!isAvailable) {
            List<String> affectedGroups = commandToGroupMapping.get(command);
            if (affectedGroups != null) {
                for (String group : affectedGroups) {
                    List<String> affectedFeatures = getAffectedFeatures(group);
                    endpointConfiguration.disableGroup(group);
                    log.warn(
                            "Missing dependency: {} - Disabling group: {} (Affected features: {})",
                            command,
                            group,
                            affectedFeatures != null && !affectedFeatures.isEmpty()
                                    ? String.join(", ", affectedFeatures)
                                    : "unknown");
                }
            }
        }
    }

    @PostConstruct
    public void checkDependencies() {
        // Check core dependencies
        checkDependencyAndDisableGroup("tesseract");
        checkDependencyAndDisableGroup("soffice");
        checkDependencyAndDisableGroup("qpdf");
        checkDependencyAndDisableGroup(weasyprintPath);
        checkDependencyAndDisableGroup("pdftohtml");
        checkDependencyAndDisableGroup(unoconvPath);
        // Special handling for Python/OpenCV dependencies
        boolean pythonAvailable = isCommandAvailable("python3") || isCommandAvailable("python");
        if (!pythonAvailable) {
            List<String> pythonFeatures = getAffectedFeatures("Python");
            List<String> openCVFeatures = getAffectedFeatures("OpenCV");
            endpointConfiguration.disableGroup("Python");
            endpointConfiguration.disableGroup("OpenCV");
            log.warn(
                    "Missing dependency: Python - Disabling Python features: {} and OpenCV features: {}",
                    String.join(", ", pythonFeatures),
                    String.join(", ", openCVFeatures));
        } else {
            // If Python is available, check for OpenCV
            try {
                ProcessBuilder processBuilder = new ProcessBuilder();
                if (System.getProperty("os.name").toLowerCase().contains("windows")) {
                    processBuilder.command("python", "-c", "import cv2");
                } else {
                    processBuilder.command("python3", "-c", "import cv2");
                }
                Process process = processBuilder.start();
                int exitCode = process.waitFor();
                if (exitCode != 0) {
                    List<String> openCVFeatures = getAffectedFeatures("OpenCV");
                    endpointConfiguration.disableGroup("OpenCV");
                    log.warn(
                            "OpenCV not available in Python - Disabling OpenCV features: {}",
                            String.join(", ", openCVFeatures));
                }
            } catch (Exception e) {
                List<String> openCVFeatures = getAffectedFeatures("OpenCV");
                endpointConfiguration.disableGroup("OpenCV");
                log.warn(
                        "Error checking OpenCV: {} - Disabling OpenCV features: {}",
                        e.getMessage(),
                        String.join(", ", openCVFeatures));
            }
        }
        endpointConfiguration.logDisabledEndpointsSummary();
    }
}
