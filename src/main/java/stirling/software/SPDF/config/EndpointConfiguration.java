package stirling.software.SPDF.config;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

@Service
public class EndpointConfiguration {

    private Map<String, Boolean> endpointStatuses = new ConcurrentHashMap<>();
    private Map<String, Set<String>> endpointGroups = new ConcurrentHashMap<>();

    public EndpointConfiguration() {
        init();
        processEnvironmentConfigs();
    }
    
    public void enableEndpoint(String endpoint) {
        endpointStatuses.put(endpoint, true);
    }

    public void disableEndpoint(String endpoint) {
        endpointStatuses.put(endpoint, false);
    }

    public boolean isEndpointEnabled(String endpoint) {
        if (endpoint.startsWith("/")) {
            endpoint = endpoint.substring(1);
        }
        return endpointStatuses.getOrDefault(endpoint, true);
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
    
    public void init() {
        // Adding endpoints to "PageOps" group
        addEndpointToGroup("PageOps", "remove-pages");
        addEndpointToGroup("PageOps", "merge-pdfs");
        addEndpointToGroup("PageOps", "split-pdfs");
        addEndpointToGroup("PageOps", "pdf-organizer");
        addEndpointToGroup("PageOps", "rotate-pdf");

        // Adding endpoints to "Convert" group
        addEndpointToGroup("Convert", "pdf-to-img");
        addEndpointToGroup("Convert", "img-to-pdf");
        addEndpointToGroup("Convert", "pdf-to-pdfa");
        addEndpointToGroup("Convert", "file-to-pdf");
        addEndpointToGroup("Convert", "xlsx-to-pdf");
        addEndpointToGroup("Convert", "pdf-to-word");
        addEndpointToGroup("Convert", "pdf-to-presentation");
        addEndpointToGroup("Convert", "pdf-to-text");
        addEndpointToGroup("Convert", "pdf-to-html");
        addEndpointToGroup("Convert", "pdf-to-xml");

        // Adding endpoints to "Security" group
        addEndpointToGroup("Security", "add-password");
        addEndpointToGroup("Security", "remove-password");
        addEndpointToGroup("Security", "change-permissions");
        addEndpointToGroup("Security", "add-watermark");

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
        addEndpointToGroup("Other", "remove-blanks");
        addEndpointToGroup("Other", "compare");
        
        
        
        
        
        
        
        //CLI
        addEndpointToGroup("CLI", "compress-pdf");
        addEndpointToGroup("CLI", "extract-image-scans");
        addEndpointToGroup("CLI", "remove-blanks");
        addEndpointToGroup("CLI", "repair");
        addEndpointToGroup("CLI", "pdf-to-pdfa");
        addEndpointToGroup("CLI", "file-to-pdf");
        addEndpointToGroup("CLI", "xlsx-to-pdf");
        addEndpointToGroup("CLI", "pdf-to-word");
        addEndpointToGroup("CLI", "pdf-to-presentation");
        addEndpointToGroup("CLI", "pdf-to-text");
        addEndpointToGroup("CLI", "pdf-to-html");
        addEndpointToGroup("CLI", "pdf-to-xml");
        
        //python
        addEndpointToGroup("Python", "extract-image-scans");
        addEndpointToGroup("Python", "remove-blanks");
        
  
        
        //openCV
        addEndpointToGroup("OpenCV", "extract-image-scans");
        addEndpointToGroup("OpenCV", "remove-blanks");

        //LibreOffice
        addEndpointToGroup("LibreOffice", "repair");
        addEndpointToGroup("LibreOffice", "file-to-pdf");
        addEndpointToGroup("LibreOffice", "xlsx-to-pdf");
        addEndpointToGroup("LibreOffice", "pdf-to-word");
        addEndpointToGroup("LibreOffice", "pdf-to-presentation");
        addEndpointToGroup("LibreOffice", "pdf-to-text");
        addEndpointToGroup("LibreOffice", "pdf-to-html");
        addEndpointToGroup("LibreOffice", "pdf-to-xml");
        
        
        //OCRmyPDF
        addEndpointToGroup("OCRmyPDF", "compress-pdf");
        addEndpointToGroup("OCRmyPDF", "pdf-to-pdfa");
        
        disableEndpoint("remove-pages");
        disableEndpoint("compress-pdf");
    }
                
    private void processEnvironmentConfigs() {
        String endpointsToRemove = System.getenv("ENDPOINTS_TO_REMOVE");
        String groupsToRemove = System.getenv("GROUPS_TO_REMOVE");

        if (endpointsToRemove != null) {
            String[] endpoints = endpointsToRemove.split(",");
            for (String endpoint : endpoints) {
                disableEndpoint(endpoint.trim());
            }
        }

        if (groupsToRemove != null) {
            String[] groups = groupsToRemove.split(",");
            for (String group : groups) {
                disableGroup(group.trim());
            }
        }
    }

}

