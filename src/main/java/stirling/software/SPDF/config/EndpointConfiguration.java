package stirling.software.SPDF.config;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.ApplicationProperties;

@Service
@Slf4j
public class EndpointConfiguration {

    private static final String REMOVE_BLANKS = "remove-blanks";
    private final ApplicationProperties applicationProperties;
    private Map<String, Boolean> endpointStatuses = new ConcurrentHashMap<>();
    private Map<String, Set<String>> endpointGroups = new ConcurrentHashMap<>();
    private final boolean runningProOrHigher;

    public EndpointConfiguration(
            ApplicationProperties applicationProperties,
            @Qualifier("runningProOrHigher") boolean runningProOrHigher) {
        this.applicationProperties = applicationProperties;
        this.runningProOrHigher = runningProOrHigher;
        init();
        processEnvironmentConfigs();
    }

    public void enableEndpoint(String endpoint) {
        endpointStatuses.put(endpoint, true);
    }

    public void disableEndpoint(String endpoint) {
        if (!endpointStatuses.containsKey(endpoint) || endpointStatuses.get(endpoint) != false) {
            log.debug("Disabling {}", endpoint);
            endpointStatuses.put(endpoint, false);
        }
    }

    public Map<String, Boolean> getEndpointStatuses() {
        return endpointStatuses;
    }

    public boolean isEndpointEnabled(String endpoint) {
        if (endpoint.startsWith("/")) {
            endpoint = endpoint.substring(1);
        }
        return endpointStatuses.getOrDefault(endpoint, true);
    }

    public boolean isGroupEnabled(String group) {
        Set<String> endpoints = endpointGroups.get(group);
        if (endpoints == null || endpoints.isEmpty()) {
            log.debug("Group '{}' does not exist or has no endpoints", group);
            return false;
        }

        for (String endpoint : endpoints) {
            if (!isEndpointEnabled(endpoint)) {
                return false;
            }
        }

        return true;
    }

    public void addEndpointToGroup(String group, String endpoint) {
        endpointGroups.computeIfAbsent(group, k -> new HashSet<>()).add(endpoint);
    }

    public void enableGroup(String group) {
        Set<String> endpoints = endpointGroups.get(group);
        if (endpoints != null) {
            for (String endpoint : endpoints) {
                enableEndpoint(endpoint);
            }
        }
    }

    public void disableGroup(String group) {
        Set<String> endpoints = endpointGroups.get(group);
        if (endpoints != null) {
            for (String endpoint : endpoints) {
                disableEndpoint(endpoint);
            }
        }
    }

    public void logDisabledEndpointsSummary() {
        List<String> disabledList =
                endpointStatuses.entrySet().stream()
                        .filter(entry -> !entry.getValue()) // only get disabled endpoints (value
                        // is false)
                        .map(Map.Entry::getKey)
                        .sorted()
                        .toList();

        if (!disabledList.isEmpty()) {
            log.info(
                    "Total disabled endpoints: {}. Disabled endpoints: {}",
                    disabledList.size(),
                    String.join(", ", disabledList));
        }
    }

    public void init() {
        // Adding endpoints to "PageOps" group
        addEndpointToGroup("PageOps", "remove-pages");
        addEndpointToGroup("PageOps", "merge-pdfs");
        addEndpointToGroup("PageOps", "split-pdfs");
        addEndpointToGroup("PageOps", "pdf-organizer");
        addEndpointToGroup("PageOps", "rotate-pdf");
        addEndpointToGroup("PageOps", "multi-page-layout");
        addEndpointToGroup("PageOps", "scale-pages");
        addEndpointToGroup("PageOps", "adjust-contrast");
        addEndpointToGroup("PageOps", "crop");
        addEndpointToGroup("PageOps", "auto-split-pdf");
        addEndpointToGroup("PageOps", "extract-page");
        addEndpointToGroup("PageOps", "pdf-to-single-page");
        addEndpointToGroup("PageOps", "split-by-size-or-count");
        addEndpointToGroup("PageOps", "overlay-pdf");
        addEndpointToGroup("PageOps", "split-pdf-by-sections");

        // Adding endpoints to "Convert" group
        addEndpointToGroup("Convert", "pdf-to-img");
        addEndpointToGroup("Convert", "img-to-pdf");
        addEndpointToGroup("Convert", "pdf-to-pdfa");
        addEndpointToGroup("Convert", "file-to-pdf");
        addEndpointToGroup("Convert", "pdf-to-word");
        addEndpointToGroup("Convert", "pdf-to-presentation");
        addEndpointToGroup("Convert", "pdf-to-text");
        addEndpointToGroup("Convert", "pdf-to-html");
        addEndpointToGroup("Convert", "pdf-to-xml");
        addEndpointToGroup("Convert", "html-to-pdf");
        addEndpointToGroup("Convert", "url-to-pdf");
        addEndpointToGroup("Convert", "markdown-to-pdf");
        addEndpointToGroup("Convert", "pdf-to-csv");
        addEndpointToGroup("Convert", "pdf-to-markdown");

        // Adding endpoints to "Security" group
        addEndpointToGroup("Security", "add-password");
        addEndpointToGroup("Security", "remove-password");
        addEndpointToGroup("Security", "change-permissions");
        addEndpointToGroup("Security", "add-watermark");
        addEndpointToGroup("Security", "cert-sign");
        addEndpointToGroup("Security", "remove-cert-sign");
        addEndpointToGroup("Security", "sanitize-pdf");
        addEndpointToGroup("Security", "auto-redact");
        addEndpointToGroup("Security", "redact");

        // Adding endpoints to "Other" group
        addEndpointToGroup("Other", "ocr-pdf");
        addEndpointToGroup("Other", "add-image");
        addEndpointToGroup("Other", "compress-pdf");
        addEndpointToGroup("Other", "extract-images");
        addEndpointToGroup("Other", "change-metadata");
        addEndpointToGroup("Other", "extract-image-scans");
        addEndpointToGroup("Other", "sign");
        addEndpointToGroup("Other", "flatten");
        addEndpointToGroup("Other", "repair");
        addEndpointToGroup("Other", "unlock-pdf-forms");
        addEndpointToGroup("Other", REMOVE_BLANKS);
        addEndpointToGroup("Other", "remove-annotations");
        addEndpointToGroup("Other", "compare");
        addEndpointToGroup("Other", "add-page-numbers");
        addEndpointToGroup("Other", "auto-rename");
        addEndpointToGroup("Other", "get-info-on-pdf");
        addEndpointToGroup("Other", "show-javascript");
        addEndpointToGroup("Other", "remove-image-pdf");

        // CLI
        addEndpointToGroup("CLI", "compress-pdf");
        addEndpointToGroup("CLI", "extract-image-scans");
        addEndpointToGroup("CLI", "repair");
        addEndpointToGroup("CLI", "pdf-to-pdfa");
        addEndpointToGroup("CLI", "file-to-pdf");
        addEndpointToGroup("CLI", "pdf-to-word");
        addEndpointToGroup("CLI", "pdf-to-presentation");
        addEndpointToGroup("CLI", "pdf-to-html");
        addEndpointToGroup("CLI", "pdf-to-xml");
        addEndpointToGroup("CLI", "ocr-pdf");
        addEndpointToGroup("CLI", "html-to-pdf");
        addEndpointToGroup("CLI", "url-to-pdf");
        addEndpointToGroup("CLI", "pdf-to-rtf");

        // python
        addEndpointToGroup("Python", "extract-image-scans");
        addEndpointToGroup("Python", "html-to-pdf");
        addEndpointToGroup("Python", "url-to-pdf");
        addEndpointToGroup("Python", "file-to-pdf");

        // openCV
        addEndpointToGroup("OpenCV", "extract-image-scans");

        // LibreOffice
        addEndpointToGroup("LibreOffice", "file-to-pdf");
        addEndpointToGroup("LibreOffice", "pdf-to-word");
        addEndpointToGroup("LibreOffice", "pdf-to-presentation");
        addEndpointToGroup("LibreOffice", "pdf-to-rtf");
        addEndpointToGroup("LibreOffice", "pdf-to-html");
        addEndpointToGroup("LibreOffice", "pdf-to-xml");
        addEndpointToGroup("LibreOffice", "pdf-to-pdfa");

        // Unoconvert
        addEndpointToGroup("Unoconvert", "file-to-pdf");

        addEndpointToGroup("tesseract", "ocr-pdf");

        // Java
        addEndpointToGroup("Java", "merge-pdfs");
        addEndpointToGroup("Java", "remove-pages");
        addEndpointToGroup("Java", "split-pdfs");
        addEndpointToGroup("Java", "pdf-organizer");
        addEndpointToGroup("Java", "rotate-pdf");
        addEndpointToGroup("Java", "pdf-to-img");
        addEndpointToGroup("Java", "img-to-pdf");
        addEndpointToGroup("Java", "add-password");
        addEndpointToGroup("Java", "remove-password");
        addEndpointToGroup("Java", "change-permissions");
        addEndpointToGroup("Java", "add-watermark");
        addEndpointToGroup("Java", "add-image");
        addEndpointToGroup("Java", "extract-images");
        addEndpointToGroup("Java", "change-metadata");
        addEndpointToGroup("Java", "cert-sign");
        addEndpointToGroup("Java", "remove-cert-sign");
        addEndpointToGroup("Java", "multi-page-layout");
        addEndpointToGroup("Java", "scale-pages");
        addEndpointToGroup("Java", "add-page-numbers");
        addEndpointToGroup("Java", "auto-rename");
        addEndpointToGroup("Java", "auto-split-pdf");
        addEndpointToGroup("Java", "sanitize-pdf");
        addEndpointToGroup("Java", "crop");
        addEndpointToGroup("Java", "get-info-on-pdf");
        addEndpointToGroup("Java", "extract-page");
        addEndpointToGroup("Java", "pdf-to-single-page");
        addEndpointToGroup("Java", "markdown-to-pdf");
        addEndpointToGroup("Java", "show-javascript");
        addEndpointToGroup("Java", "auto-redact");
        addEndpointToGroup("Java", "redact");
        addEndpointToGroup("Java", "pdf-to-csv");
        addEndpointToGroup("Java", "split-by-size-or-count");
        addEndpointToGroup("Java", "overlay-pdf");
        addEndpointToGroup("Java", "split-pdf-by-sections");
        addEndpointToGroup("Java", REMOVE_BLANKS);
        addEndpointToGroup("Java", "pdf-to-text");
        addEndpointToGroup("Java", "remove-image-pdf");
        addEndpointToGroup("Java", "pdf-to-markdown");

        // Javascript
        addEndpointToGroup("Javascript", "pdf-organizer");
        addEndpointToGroup("Javascript", "sign");
        addEndpointToGroup("Javascript", "compare");
        addEndpointToGroup("Javascript", "adjust-contrast");

        // qpdf dependent endpoints
        addEndpointToGroup("qpdf", "repair");

        // Weasyprint dependent endpoints
        addEndpointToGroup("Weasyprint", "html-to-pdf");
        addEndpointToGroup("Weasyprint", "url-to-pdf");
        addEndpointToGroup("Weasyprint", "markdown-to-pdf");

        // Pdftohtml dependent endpoints
        addEndpointToGroup("Pdftohtml", "pdf-to-html");
        addEndpointToGroup("Pdftohtml", "pdf-to-markdown");
    }

    private void processEnvironmentConfigs() {
        if (applicationProperties != null && applicationProperties.getEndpoints() != null) {
            List<String> endpointsToRemove = applicationProperties.getEndpoints().getToRemove();
            List<String> groupsToRemove = applicationProperties.getEndpoints().getGroupsToRemove();

            if (endpointsToRemove != null) {
                for (String endpoint : endpointsToRemove) {
                    disableEndpoint(endpoint.trim());
                }
            }

            if (groupsToRemove != null) {
                for (String group : groupsToRemove) {
                    disableGroup(group.trim());
                }
            }
        }
        if (!runningProOrHigher) {
            disableGroup("enterprise");
        }

        if (!applicationProperties.getSystem().getEnableUrlToPDF()) {
            disableEndpoint("url-to-pdf");
        }
    }

    public Set<String> getEndpointsForGroup(String group) {
        return endpointGroups.getOrDefault(group, new HashSet<>());
    }
}
