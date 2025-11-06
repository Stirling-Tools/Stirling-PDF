package stirling.software.SPDF.service;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;

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

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.SPDFApplication;
import stirling.software.SPDF.model.ApiEndpoint;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.common.util.RegexPatternUtils;

@Service
@Slf4j
public class ApiDocService {

    private final Map<String, ApiEndpoint> apiDocumentation = new HashMap<>();

    private final ServletContext servletContext;
    private final UserServiceInterface userService;
    Map<String, List<String>> outputToFileTypes = new HashMap<>();
    JsonNode apiDocsJsonRootNode;

    public ApiDocService(
            ServletContext servletContext,
            @Autowired(required = false) UserServiceInterface userService) {
        this.servletContext = servletContext;
        this.userService = userService;
    }

    private String getApiDocsUrl() {
        String contextPath = servletContext.getContextPath();
        String port = SPDFApplication.getStaticPort();
        return "http://localhost:" + port + contextPath + "/v1/api-docs";
    }

    public List<String> getExtensionTypes(boolean output, String operationName) {
        if (outputToFileTypes.isEmpty()) {
            outputToFileTypes.put("PDF", List.of("pdf"));
            outputToFileTypes.put(
                    "IMAGE",
                    Arrays.asList(
                            "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg", "psd",
                            "ai", "eps"));
            outputToFileTypes.put(
                    "ZIP",
                    Arrays.asList("zip", "rar", "7z", "tar", "gz", "bz2", "xz", "lz", "lzma", "z"));
            outputToFileTypes.put("WORD", Arrays.asList("doc", "docx", "odt", "rtf"));
            outputToFileTypes.put("CSV", List.of("csv"));
            outputToFileTypes.put("JS", Arrays.asList("js", "jsx"));
            outputToFileTypes.put("HTML", Arrays.asList("html", "htm", "xhtml"));
            outputToFileTypes.put("JSON", List.of("json"));
            outputToFileTypes.put("TXT", Arrays.asList("txt", "text", "md", "markdown"));
            outputToFileTypes.put("PPT", Arrays.asList("ppt", "pptx", "odp"));
            outputToFileTypes.put("XML", Arrays.asList("xml", "xsd", "xsl"));
            outputToFileTypes.put(
                    "BOOK", Arrays.asList("epub", "mobi", "azw3", "fb2", "txt", "docx"));
            // type.
        }
        if (apiDocsJsonRootNode == null || apiDocumentation.isEmpty()) {
            loadApiDocumentation();
        }
        if (!apiDocumentation.containsKey(operationName)) {
            return null;
        }
        ApiEndpoint endpoint = apiDocumentation.get(operationName);
        String description = endpoint.getDescription();
        Matcher matcher =
                (output
                                ? RegexPatternUtils.getInstance().getApiDocOutputTypePattern()
                                : RegexPatternUtils.getInstance().getApiDocInputTypePattern())
                        .matcher(description);
        while (matcher.find()) {
            String type = matcher.group(1).toUpperCase(Locale.ROOT);
            if (outputToFileTypes.containsKey(type)) {
                return outputToFileTypes.get(type);
            }
        }
        return null;
    }

    private String getApiKeyForUser() {
        if (userService == null) return "";
        return userService.getApiKeyForUser(Role.INTERNAL_API_USER.getRoleId());
    }

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
            paths.propertyStream()
                    .forEach(
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
            log.error("Error grabbing swagger doc, body result {}", apiDocsJson);
        }
    }

    public boolean isValidOperation(String operationName, Map<String, Object> parameters) {
        if (apiDocumentation.isEmpty()) {
            loadApiDocumentation();
        }
        if (!apiDocumentation.containsKey(operationName)) {
            return false;
        }
        ApiEndpoint endpoint = apiDocumentation.get(operationName);
        return endpoint.areParametersValid(parameters);
    }

    public boolean isMultiInput(String operationName) {
        if (apiDocsJsonRootNode == null || apiDocumentation.isEmpty()) {
            loadApiDocumentation();
        }
        if (!apiDocumentation.containsKey(operationName)) {
            return false;
        }
        ApiEndpoint endpoint = apiDocumentation.get(operationName);
        String description = endpoint.getDescription();
        Matcher matcher =
                RegexPatternUtils.getInstance().getApiDocTypePattern().matcher(description);
        if (matcher.find()) {
            String type = matcher.group(1);
            return type.startsWith("MI");
        }
        return false;
    }
}
// Model class for API Endpoint
