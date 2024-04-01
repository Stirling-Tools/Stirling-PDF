package stirling.software.SPDF.config;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.DependsOn;
import org.springframework.stereotype.Service;

import stirling.software.SPDF.model.ApplicationProperties;

@Service
@DependsOn({"bookAndHtmlFormatsInstalled"})
public class EndpointConfiguration {
    private static final Logger logger = LoggerFactory.getLogger(EndpointConfiguration.class);
    private Map<String, Boolean> endpointStatuses = new ConcurrentHashMap<>();
    private Map<String, Set<String>> endpointGroups = new ConcurrentHashMap<>();

    private final ApplicationProperties applicationProperties;

    private boolean bookAndHtmlFormatsInstalled;

    @Autowired
    public EndpointConfiguration(
            ApplicationProperties applicationProperties,
            @Qualifier("bookAndHtmlFormatsInstalled") boolean bookAndHtmlFormatsInstalled) {
        this.applicationProperties = applicationProperties;
        this.bookAndHtmlFormatsInstalled = bookAndHtmlFormatsInstalled;
        initialize();
        processEnvironmentConfigs();
    }

    private void initialize() {
        // Define endpoints for each group explicitly as String arrays
        String[] pageOpsEndpoints = {
                "remove-pages",
                "merge-pdfs",
                "split-pdfs",
                "pdf-organizer",
                "rotate-pdf",
                "multi-page-layout",
                "scale-pages",
                "adjust-contrast",
                "crop",
                "auto-split-pdf",
                "extract-page",
                "pdf-to-single-page",
                "split-by-size-or-count",
                "overlay-pdf",
                "split-pdf-by-sections"
        };

        String[] convertEndpoints = {
                "pdf-to-img",
                "img-to-pdf",
                "pdf-to-pdfa",
                "file-to-pdf",
                "xlsx-to-pdf",
                "pdf-to-word",
                "pdf-to-presentation",
                "pdf-to-text",
                "pdf-to-html",
                "pdf-to-xml",
                "html-to-pdf",
                "url-to-pdf",
                "markdown-to-pdf",
                "pdf-to-csv"
        };

        String[] securityEndpoints = {
                "add-password",
                "remove-password",
                "change-permissions",
                "add-watermark",
                "cert-sign",
                "sanitize-pdf",
                "auto-redact"
        };

        String[] otherEndpoints = {
                "ocr-pdf",
                "add-image",
                "compress-pdf",
                "extract-images",
                "change-metadata",
                "extract-image-scans",
                "sign",
                "flatten",
                "repair",
                "remove-blanks",
                "remove-annotations",
                "compare",
                "add-page-numbers",
                "auto-rename",
                "get-info-on-pdf",
                "show-javascript"
        };

        String[] cliEndpoints = {
                "compress-pdf",
                "extract-image-scans",
                "repair",
                "pdf-to-pdfa",
                "file-to-pdf",
                "xlsx-to-pdf",
                "pdf-to-word",
                "pdf-to-presentation",
                "pdf-to-text",
                "pdf-to-html",
                "pdf-to-xml",
                "ocr-pdf",
                "html-to-pdf",
                "url-to-pdf",
                "book-to-pdf",
                "pdf-to-book"
        };

        String[] calibreEndpoints = {
                "book-to-pdf",
                "pdf-to-book"
        };

        String[] pythonEndpoints = {
                "extract-image-scans",
                "remove-blanks",
                "html-to-pdf",
                "url-to-pdf"
        };

        String[] openCVEndpoints = {
                "extract-image-scans",
                "remove-blanks"
        };

        String[] libreOfficeEndpoints = {
                "repair",
                "file-to-pdf",
                "xlsx-to-pdf",
                "pdf-to-word",
                "pdf-to-presentation",
                "pdf-to-text",
                "pdf-to-html",
                "pdf-to-xml"
        };

        String[] ocrmyPDFEndpoints = {
                "compress-pdf",
                "pdf-to-pdfa",
                "ocr-pdf"
        };

        String[] javaEndpoints = {
                "merge-pdfs",
                "remove-pages",
                "split-pdfs",
                "pdf-organizer",
                "rotate-pdf",
                "pdf-to-img",
                "img-to-pdf",
                "add-password",
                "remove-password",
                "change-permissions",
                "add-watermark",
                "add-image",
                "extract-images",
                "change-metadata",
                "cert-sign",
                "multi-page-layout",
                "scale-pages",
                "add-page-numbers",
                "auto-rename",
                "auto-split-pdf",
                "sanitize-pdf",
                "crop",
                "get-info-on-pdf",
                "extract-page",
                "pdf-to-single-page",
                "markdown-to-pdf",
                "show-javascript",
                "auto-redact",
                "pdf-to-csv",
                "split-by-size-or-count",
                "overlay-pdf",
                "split-pdf-by-sections",
                "remove-blanks"
        };

        String[] javascriptEndpoints = {
                "pdf-organizer",
                "sign",
                "compare",
                "adjust-contrast"
        };

        // Add each group with its respective endpoints
        addEndpointsToGroup("PageOps", pageOpsEndpoints);
        addEndpointsToGroup("Convert", convertEndpoints);
        addEndpointsToGroup("Security", securityEndpoints);
        addEndpointsToGroup("Other", otherEndpoints);
        addEndpointsToGroup("CLI", cliEndpoints);
        addEndpointsToGroup("Calibre", calibreEndpoints);
        addEndpointsToGroup("Python", pythonEndpoints);
        addEndpointsToGroup("OpenCV", openCVEndpoints);
        addEndpointsToGroup("LibreOffice", libreOfficeEndpoints);
        addEndpointsToGroup("OCRmyPDF", ocrmyPDFEndpoints);
        addEndpointsToGroup("Java", javaEndpoints);
        addEndpointsToGroup("Javascript", javascriptEndpoints);
    }

    private void addEndpointsToGroup(String group, String[] endpoints) {
        for (String endpoint : endpoints) {
            addEndpointToGroup(group, endpoint);
        }
    }

    private void addEndpointToGroup(String group, String endpoint) {
        endpointGroups.computeIfAbsent(group, k -> new HashSet<>()).add(endpoint);
    }

    private void processEnvironmentConfigs() {
        List<String> endpointsToRemove = applicationProperties.getEndpoints().getToRemove();
        List<String> groupsToRemove = applicationProperties.getEndpoints().getGroupsToRemove();
        if (!bookAndHtmlFormatsInstalled) {
            groupsToRemove.add("Calibre");
        }
        disableEndpoints(endpointsToRemove);
        disableGroups(groupsToRemove);
    }

    private void disableEndpoints(List<String> endpointsToRemove) {
        if (endpointsToRemove != null) {
            for (String endpoint : endpointsToRemove) {
                disableEndpoint(endpoint.trim());
            }
        }
    }

    private void disableGroups(List<String> groupsToRemove) {
        if (groupsToRemove != null) {
            for (String group : groupsToRemove) {
                disableGroup(group.trim());
            }
        }
    }

    public void enableEndpoint(String endpoint) {
        endpointStatuses.put(endpoint, true);
    }

    public void disableEndpoint(String endpoint) {
        if (!isAlreadyDisabled(endpoint)) {
            logger.info("Disabling {}", endpoint);
            endpointStatuses.put(endpoint, false);
        }
    }

    private boolean isAlreadyDisabled(String endpoint) {
        return !endpointStatuses.containsKey(endpoint) || !endpointStatuses.get(endpoint);
    }

    public boolean isEndpointEnabled(String endpoint) {
        return endpointStatuses.getOrDefault(
                endpoint.startsWith("/") ? endpoint.substring(1) : endpoint, true);
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
}
