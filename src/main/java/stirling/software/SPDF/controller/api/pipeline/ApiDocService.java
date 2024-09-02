package stirling.software.SPDF.controller.api.pipeline;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.ServletContext;
import stirling.software.SPDF.SPdfApplication;
import stirling.software.SPDF.model.ApiEndpoint;
import stirling.software.SPDF.model.Role;

@Service
public class ApiDocService {

    private final Map<String, ApiEndpoint> apiDocumentation = new HashMap<>();

    private static final Logger logger = LoggerFactory.getLogger(ApiDocService.class);

    @Autowired private ServletContext servletContext;

    private String getApiDocsUrl() {
        String contextPath = servletContext.getContextPath();
        String port = SPdfApplication.getStaticPort();

        return "http://localhost:" + port + contextPath + "/v1/api-docs";
    }

    Map<String, List<String>> outputToFileTypes = new HashMap<>();

    public List<String> getExtensionTypes(boolean output, String operationName) {
        if (outputToFileTypes.size() == 0) {
            outputToFileTypes.put("PDF", Arrays.asList("pdf"));
            outputToFileTypes.put(
                    "IMAGE",
                    Arrays.asList(
                            "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg", "psd",
                            "ai", "eps"));
            outputToFileTypes.put(
                    "ZIP",
                    Arrays.asList("zip", "rar", "7z", "tar", "gz", "bz2", "xz", "lz", "lzma", "z"));
            outputToFileTypes.put("WORD", Arrays.asList("doc", "docx", "odt", "rtf"));
            outputToFileTypes.put("CSV", Arrays.asList("csv"));
            outputToFileTypes.put("JS", Arrays.asList("js", "jsx"));
            outputToFileTypes.put("HTML", Arrays.asList("html", "htm", "xhtml"));
            outputToFileTypes.put("JSON", Arrays.asList("json"));
            outputToFileTypes.put("TXT", Arrays.asList("txt", "text", "md", "markdown"));
            outputToFileTypes.put("PPT", Arrays.asList("ppt", "pptx", "odp"));
            outputToFileTypes.put("XML", Arrays.asList("xml", "xsd", "xsl"));
            outputToFileTypes.put(
                    "BOOK", Arrays.asList("epub", "mobi", "azw3", "fb2", "txt", "docx"));
            // type.
        }

        if (apiDocsJsonRootNode == null || apiDocumentation.size() == 0) {
            loadApiDocumentation();
        }
        if (!apiDocumentation.containsKey(operationName)) {
            return null;
        }

        ApiEndpoint endpoint = apiDocumentation.get(operationName);
        String description = endpoint.getDescription();
        Pattern pattern = null;
        if (output) {
            pattern = Pattern.compile("Output:(\\w+)");
        } else {
            pattern = Pattern.compile("Input:(\\w+)");
        }
        Matcher matcher = pattern.matcher(description);
        while (matcher.find()) {
            String type = matcher.group(1).toUpperCase();
            if (outputToFileTypes.containsKey(type)) {
                return outputToFileTypes.get(type);
            }
        }
        return null;
    }

    @Autowired(required = false)
    private UserServiceInterface userService;

    private String getApiKeyForUser() {
        if (userService == null) return "";
        return userService.getApiKeyForUser(Role.INTERNAL_API_USER.getRoleId());
    }

    JsonNode apiDocsJsonRootNode;

    // @EventListener(ApplicationReadyEvent.class)
    private synchronized void loadApiDocumentation() {
        String apiDocsJson = "";
        try {
            HttpHeaders headers = new HttpHeaders();
            String apiKey = getApiKeyForUser();
            if (!apiKey.isEmpty()) {
                headers.set("X-API-KEY", apiKey);
            }
            HttpEntity<String> entity = new HttpEntity<>(headers);

            RestTemplate restTemplate = new RestTemplate();
            ResponseEntity<String> response =
                    restTemplate.exchange(getApiDocsUrl(), HttpMethod.GET, entity, String.class);
            apiDocsJson = response.getBody();

            ObjectMapper mapper = new ObjectMapper();
            apiDocsJsonRootNode = mapper.readTree(apiDocsJson);

            JsonNode paths = apiDocsJsonRootNode.path("paths");
            paths.fields()
                    .forEachRemaining(
                            entry -> {
                                String path = entry.getKey();
                                JsonNode pathNode = entry.getValue();
                                if (pathNode.has("post")) {
                                    JsonNode postNode = pathNode.get("post");
                                    ApiEndpoint endpoint = new ApiEndpoint(path, postNode);
                                    apiDocumentation.put(path, endpoint);
                                }
                            });
        } catch (Exception e) {
            // Handle exceptions
            logger.error("Error grabbing swagger doc, body result {}", apiDocsJson);
        }
    }

    public boolean isValidOperation(String operationName, Map<String, Object> parameters) {
        if (apiDocumentation.size() == 0) {
            loadApiDocumentation();
        }
        if (!apiDocumentation.containsKey(operationName)) {
            return false;
        }
        ApiEndpoint endpoint = apiDocumentation.get(operationName);
        return endpoint.areParametersValid(parameters);
    }

    public boolean isMultiInput(String operationName) {
        if (apiDocsJsonRootNode == null || apiDocumentation.size() == 0) {
            loadApiDocumentation();
        }
        if (!apiDocumentation.containsKey(operationName)) {
            return false;
        }

        ApiEndpoint endpoint = apiDocumentation.get(operationName);
        String description = endpoint.getDescription();

        Pattern pattern = Pattern.compile("Type:(\\w+)");
        Matcher matcher = pattern.matcher(description);
        if (matcher.find()) {
            String type = matcher.group(1);
            return type.startsWith("MI");
        }

        return false;
    }
}

// Model class for API Endpoint
