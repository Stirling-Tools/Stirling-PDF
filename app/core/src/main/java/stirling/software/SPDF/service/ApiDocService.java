package stirling.software.SPDF.service;

import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import jakarta.servlet.ServletContext;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.SPDFApplication;
import stirling.software.SPDF.model.ApiEndpoint;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.service.UserServiceInterface;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Validates a request's parameters against the OpenAPI spec.
 *
 * <p>Input and output types are no longer read from here: they are declared with {@code @ToolIO}
 * and served by {@code ToolIORegistry}, which reads the annotations directly rather than parsing
 * them back out of the description prose.
 */
@Service
@Slf4j
public class ApiDocService {

    private final Map<String, ApiEndpoint> apiDocumentation = new HashMap<>();

    private final ServletContext servletContext;
    private final UserServiceInterface userService;
    private final ObjectMapper objectMapper;
    JsonNode apiDocsJsonRootNode;

    public ApiDocService(
            ObjectMapper objectMapper,
            ServletContext servletContext,
            @Autowired(required = false) UserServiceInterface userService) {
        this.objectMapper = objectMapper;
        this.servletContext = servletContext;
        this.userService = userService;
    }

    private String getApiDocsUrl() {
        String contextPath = servletContext.getContextPath();
        String port = SPDFApplication.getStaticPort();
        return "http://localhost:" + port + contextPath + "/v1/api-docs";
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
            apiDocsJsonRootNode = objectMapper.readTree(apiDocsJson);
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
}
