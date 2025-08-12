package stirling.software.SPDF.config;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@Service
@Slf4j
public class EndpointConfiguration {

    private static final String REMOVE_BLANKS = "remove-blanks";
    private final ApplicationProperties applicationProperties;
    private Map<String, Boolean> endpointStatuses = new ConcurrentHashMap<>();
    private Map<String, Set<String>> endpointGroups = new ConcurrentHashMap<>();
    private Set<String> disabledGroups = new HashSet<>();
    private Map<String, Set<String>> endpointAlternatives = new ConcurrentHashMap<>();
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
        log.debug("Enabled endpoint: {}", endpoint);
    }

    public void disableEndpoint(String endpoint) {
        if (!Boolean.FALSE.equals(endpointStatuses.get(endpoint))) {
            log.debug("Disabling endpoint: {}", endpoint);
        }
        endpointStatuses.put(endpoint, false);
    }

    public Map<String, Boolean> getEndpointStatuses() {
        return endpointStatuses;
    }

    public boolean isEndpointEnabled(String endpoint) {
        String original = endpoint;
        if (endpoint.startsWith("/")) {
            endpoint = endpoint.substring(1);
        }

        // Rule 1: Explicit flag wins - if disabled via disableEndpoint(), stay disabled
        Boolean explicitStatus = endpointStatuses.get(endpoint);
        if (Boolean.FALSE.equals(explicitStatus)) {
            log.debug("isEndpointEnabled('{}') -> false (explicitly disabled)", original);
            return false;
        }

        // Rule 2: Functional-group override - check if endpoint belongs to any disabled functional
        // group
        for (String group : endpointGroups.keySet()) {
            if (disabledGroups.contains(group) && endpointGroups.get(group).contains(endpoint)) {
                // Skip tool groups (qpdf, OCRmyPDF, Ghostscript, LibreOffice, etc.)
                if (!isToolGroup(group)) {
                    log.debug(
                            "isEndpointEnabled('{}') -> false (functional group '{}' disabled)",
                            original,
                            group);
                    return false;
                }
            }
        }

        // Rule 3: Tool-group fallback - check if at least one alternative tool group is enabled
        Set<String> alternatives = endpointAlternatives.get(endpoint);
        if (alternatives != null && !alternatives.isEmpty()) {
            boolean hasEnabledToolGroup =
                    alternatives.stream()
                            .anyMatch(toolGroup -> !disabledGroups.contains(toolGroup));
            log.debug(
                    "isEndpointEnabled('{}') -> {} (tool groups check)",
                    original,
                    hasEnabledToolGroup);
            return hasEnabledToolGroup;
        }

        // Rule 4: Single-dependency check - if no alternatives defined, check if endpoint belongs
        // to any disabled tool groups
        for (String group : endpointGroups.keySet()) {
            if (isToolGroup(group)
                    && disabledGroups.contains(group)
                    && endpointGroups.get(group).contains(endpoint)) {
                log.debug(
                        "isEndpointEnabled('{}') -> false (single tool group '{}' disabled, no alternatives)",
                        original,
                        group);
                return false;
            }
        }

        // Default: enabled if not explicitly disabled
        boolean enabled = !Boolean.FALSE.equals(explicitStatus);
        log.debug("isEndpointEnabled('{}') -> {} (default)", original, enabled);
        return enabled;
    }

    public boolean isGroupEnabled(String group) {
        // Rule 1: If group is explicitly disabled, it stays disabled
        if (disabledGroups.contains(group)) {
            log.debug("isGroupEnabled('{}') -> false (explicitly disabled)", group);
            return false;
        }

        Set<String> endpoints = endpointGroups.get(group);
        if (endpoints == null || endpoints.isEmpty()) {
            log.debug("isGroupEnabled('{}') -> false (no endpoints)", group);
            return false;
        }

        // Rule 2: For functional groups, check if all endpoints are enabled
        // Rule 3: For tool groups, they're enabled unless explicitly disabled (handled above)
        if (isToolGroup(group)) {
            log.debug("isGroupEnabled('{}') -> true (tool group not disabled)", group);
            return true;
        }

        // For functional groups, check each endpoint individually
        for (String endpoint : endpoints) {
            if (!isEndpointEnabledDirectly(endpoint)) {
                log.debug(
                        "isGroupEnabled('{}') -> false (endpoint '{}' disabled)", group, endpoint);
                return false;
            }
        }

        log.debug("isGroupEnabled('{}') -> true (all endpoints enabled)", group);
        return true;
    }

    public void addEndpointToGroup(String group, String endpoint) {
        endpointGroups.computeIfAbsent(group, k -> new HashSet<>()).add(endpoint);
    }

    public void addEndpointAlternative(String endpoint, String toolGroup) {
        endpointAlternatives.computeIfAbsent(endpoint, k -> new HashSet<>()).add(toolGroup);
    }

    public void disableGroup(String group) {
        if (disabledGroups.add(group)) {
            if (isToolGroup(group)) {
                log.debug(
                        "Disabling tool group: {} (endpoints with alternatives remain available)",
                        group);
            } else {
                log.debug(
                        "Disabling functional group: {} (will disable all endpoints in group)",
                        group);
            }
        }
        // Only cascade to endpoints for *functional* groups
        if (!isToolGroup(group)) {
            Set<String> endpoints = endpointGroups.get(group);
            if (endpoints != null) {
                endpoints.forEach(this::disableEndpoint);
            }
        }
    }

    public void enableGroup(String group) {
        if (disabledGroups.remove(group)) {
            log.debug("Enabling group: {}", group);
        }
        Set<String> endpoints = endpointGroups.get(group);
        if (endpoints != null) {
            endpoints.forEach(this::enableEndpoint);
        }
    }

    public Set<String> getDisabledGroups() {
        return new HashSet<>(disabledGroups);
    }

    public void logDisabledEndpointsSummary() {
        // Get all unique endpoints across all groups
        Set<String> allEndpoints =
                endpointGroups.values().stream()
                        .flatMap(Set::stream)
                        .collect(java.util.stream.Collectors.toSet());

        // Check which endpoints are actually disabled (functionally unavailable)
        List<String> functionallyDisabledEndpoints =
                allEndpoints.stream()
                        .filter(endpoint -> !isEndpointEnabled(endpoint))
                        .sorted()
                        .toList();

        // Separate tool groups from functional groups
        List<String> disabledToolGroups =
                disabledGroups.stream().filter(this::isToolGroup).sorted().toList();

        List<String> disabledFunctionalGroups =
                disabledGroups.stream().filter(group -> !isToolGroup(group)).sorted().toList();

        if (!disabledToolGroups.isEmpty()) {
            log.info(
                    "Disabled tool groups: {} (endpoints may have alternative implementations)",
                    String.join(", ", disabledToolGroups));
        }

        if (!disabledFunctionalGroups.isEmpty()) {
            log.info("Disabled functional groups: {}", String.join(", ", disabledFunctionalGroups));
        }

        if (!functionallyDisabledEndpoints.isEmpty()) {
            log.info(
                    "Total disabled endpoints: {}. Disabled endpoints: {}",
                    functionallyDisabledEndpoints.size(),
                    String.join(", ", functionallyDisabledEndpoints));
        } else if (!disabledToolGroups.isEmpty()) {
            log.info(
                    "No endpoints disabled despite missing tools - fallback implementations available");
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
        addEndpointToGroup("PageOps", "crop");
        addEndpointToGroup("PageOps", "extract-page");
        addEndpointToGroup("PageOps", "pdf-to-single-page");
        addEndpointToGroup("PageOps", "auto-split-pdf");
        addEndpointToGroup("PageOps", "split-by-size-or-count");
        addEndpointToGroup("PageOps", "overlay-pdf");
        addEndpointToGroup("PageOps", "split-pdf-by-sections");
        addEndpointToGroup("PageOps", "split-pdf-by-chapters");

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
        addEndpointToGroup("Convert", "eml-to-pdf");

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
        addEndpointToGroup("Security", "validate-signature");
        addEndpointToGroup("Security", "stamp");
        addEndpointToGroup("Security", "sign");

        // Adding endpoints to "Other" group
        addEndpointToGroup("Other", "ocr-pdf");
        addEndpointToGroup("Other", "add-image");
        addEndpointToGroup("Other", "extract-images");
        addEndpointToGroup("Other", "change-metadata");
        addEndpointToGroup("Other", "flatten");
        addEndpointToGroup("Other", "unlock-pdf-forms");
        addEndpointToGroup("Other", REMOVE_BLANKS);
        addEndpointToGroup("Other", "remove-annotations");
        addEndpointToGroup("Other", "compare");
        addEndpointToGroup("Other", "add-page-numbers");
        addEndpointToGroup("Other", "get-info-on-pdf");
        addEndpointToGroup("Other", "remove-image-pdf");
        addEndpointToGroup("Other", "add-attachments");
        addEndpointToGroup("Other", "view-pdf");
        addEndpointToGroup("Other", "replace-and-invert-color-pdf");
        addEndpointToGroup("Other", "multi-tool");

        // Adding endpoints to "Advance" group
        addEndpointToGroup("Advance", "adjust-contrast");
        addEndpointToGroup("Advance", "compress-pdf");
        addEndpointToGroup("Advance", "extract-image-scans");
        addEndpointToGroup("Advance", "repair");
        addEndpointToGroup("Advance", "auto-rename");
        addEndpointToGroup("Advance", "pipeline");
        addEndpointToGroup("Advance", "scanner-effect");
        addEndpointToGroup("Advance", "auto-split-pdf");
        addEndpointToGroup("Advance", "show-javascript");
        addEndpointToGroup("Advance", "split-by-size-or-count");
        addEndpointToGroup("Advance", "overlay-pdf");
        addEndpointToGroup("Advance", "split-pdf-by-sections");
        addEndpointToGroup("Advance", "edit-table-of-contents");
        addEndpointToGroup("Advance", "split-pdf-by-chapters");

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
        addEndpointToGroup("Java", "add-attachments");
        addEndpointToGroup("Java", "compress-pdf");

        // Javascript
        addEndpointToGroup("Javascript", "pdf-organizer");
        addEndpointToGroup("Javascript", "sign");
        addEndpointToGroup("Javascript", "compare");
        addEndpointToGroup("Javascript", "adjust-contrast");

        /* qpdf */
        addEndpointToGroup("qpdf", "repair");
        addEndpointToGroup("qpdf", "compress-pdf");

        /* Ghostscript */
        addEndpointToGroup("Ghostscript", "repair");
        addEndpointToGroup("Ghostscript", "compress-pdf");

        /* tesseract */
        addEndpointToGroup("tesseract", "ocr-pdf");

        /* OCRmyPDF */
        addEndpointToGroup("OCRmyPDF", "ocr-pdf");

        // Multi-tool endpoints - endpoints that can be handled by multiple tools
        addEndpointAlternative("repair", "qpdf");
        addEndpointAlternative("repair", "Ghostscript");
        addEndpointAlternative("compress-pdf", "qpdf");
        addEndpointAlternative("compress-pdf", "Ghostscript");
        addEndpointAlternative("compress-pdf", "Java");
        addEndpointAlternative("ocr-pdf", "tesseract");
        addEndpointAlternative("ocr-pdf", "OCRmyPDF");

        // file-to-pdf has multiple implementations
        addEndpointAlternative("file-to-pdf", "LibreOffice");
        addEndpointAlternative("file-to-pdf", "Unoconvert");

        // pdf-to-html and pdf-to-markdown can use either LibreOffice or Pdftohtml
        addEndpointAlternative("pdf-to-html", "LibreOffice");
        addEndpointAlternative("pdf-to-html", "Pdftohtml");
        addEndpointAlternative("pdf-to-markdown", "Pdftohtml");

        // markdown-to-pdf can use either Weasyprint or Java
        addEndpointAlternative("markdown-to-pdf", "Weasyprint");
        addEndpointAlternative("markdown-to-pdf", "Java");

        // Weasyprint dependent endpoints
        addEndpointToGroup("Weasyprint", "html-to-pdf");
        addEndpointToGroup("Weasyprint", "url-to-pdf");
        addEndpointToGroup("Weasyprint", "markdown-to-pdf");
        addEndpointToGroup("Weasyprint", "eml-to-pdf");

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

    private boolean isToolGroup(String group) {
        return "qpdf".equals(group)
                || "OCRmyPDF".equals(group)
                || "Ghostscript".equals(group)
                || "LibreOffice".equals(group)
                || "tesseract".equals(group)
                || "CLI".equals(group)
                || "Python".equals(group)
                || "OpenCV".equals(group)
                || "Unoconvert".equals(group)
                || "Java".equals(group)
                || "Javascript".equals(group)
                || "Weasyprint".equals(group)
                || "Pdftohtml".equals(group);
    }

    private boolean isEndpointEnabledDirectly(String endpoint) {
        if (endpoint.startsWith("/")) {
            endpoint = endpoint.substring(1);
        }

        // Check explicit disable flag
        Boolean explicitStatus = endpointStatuses.get(endpoint);
        if (Boolean.FALSE.equals(explicitStatus)) {
            return false;
        }

        // Check if endpoint belongs to any disabled functional group
        for (String group : endpointGroups.keySet()) {
            if (disabledGroups.contains(group) && endpointGroups.get(group).contains(endpoint)) {
                if (!isToolGroup(group)) {
                    return false;
                }
            }
        }

        return true;
    }
}
