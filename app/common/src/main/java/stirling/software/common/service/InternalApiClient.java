package stirling.software.common.service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RequestCallback;
import org.springframework.web.client.RestTemplate;

import jakarta.servlet.ServletContext;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * Dispatches HTTP POST requests to internal Stirling API endpoints via loopback. Used by
 * PipelineProcessor and AiWorkflowService to execute tool operations programmatically without
 * leaving the JVM network stack.
 */
@Service
@Slf4j
public class InternalApiClient {

    // Allowlist of URL path prefixes permitted for internal dispatch.
    private static final List<String> ALLOWED_PATH_PREFIXES =
            List.of(
                    "/api/v1/general/",
                    "/api/v1/misc/",
                    "/api/v1/security/",
                    "/api/v1/convert/",
                    "/api/v1/filter/");

    private final ServletContext servletContext;
    private final UserServiceInterface userService;
    private final TempFileManager tempFileManager;
    private final String serverPort;

    public InternalApiClient(
            ServletContext servletContext,
            @Autowired(required = false) UserServiceInterface userService,
            TempFileManager tempFileManager,
            @org.springframework.beans.factory.annotation.Value("${server.port:8080}")
                    String serverPort) {
        this.servletContext = servletContext;
        this.userService = userService;
        this.tempFileManager = tempFileManager;
        this.serverPort = serverPort;
    }

    /**
     * POST to an internal API endpoint. The endpointPath must start with one of the allowed
     * prefixes (e.g. {@code /api/v1/misc/compress-pdf}).
     *
     * @param endpointPath API path (e.g. {@code /api/v1/general/rotate-pdf})
     * @param body multipart form body (fileInput + parameters)
     * @return response with the result file as a {@link TempFileResource} body
     */
    public ResponseEntity<Resource> post(String endpointPath, MultiValueMap<String, Object> body) {
        validateUrl(endpointPath);
        String url = getBaseUrl() + endpointPath;

        RestTemplate restTemplate = new RestTemplate();
        HttpHeaders headers = new HttpHeaders();
        String apiKey = getApiKeyForUser();
        if (apiKey != null && !apiKey.isEmpty()) {
            headers.add("X-API-KEY", apiKey);
        }

        HttpEntity<MultiValueMap<String, Object>> entity = new HttpEntity<>(body, headers);
        RequestCallback requestCallback = restTemplate.httpEntityCallback(entity, Resource.class);

        return restTemplate.execute(
                url,
                HttpMethod.POST,
                requestCallback,
                response -> {
                    try {
                        TempFile tempFile = tempFileManager.createManagedTempFile("internal-api");
                        Files.copy(
                                response.getBody(),
                                tempFile.getPath(),
                                java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                        TempFileResource resource = new TempFileResource(tempFile);
                        return ResponseEntity.status(response.getStatusCode())
                                .headers(response.getHeaders())
                                .body(resource);
                    } catch (IOException e) {
                        throw new UncheckedIOException(e);
                    }
                });
    }

    private String getBaseUrl() {
        String contextPath = servletContext.getContextPath();
        return "http://localhost:" + serverPort + contextPath;
    }

    private String getApiKeyForUser() {
        if (userService == null) return "";
        String username = userService.getCurrentUsername();
        if (username != null && !username.equals("anonymousUser")) {
            return userService.getApiKeyForUser(username);
        }
        return userService.getApiKeyForUser(Role.INTERNAL_API_USER.getRoleId());
    }

    private void validateUrl(String endpointPath) {
        boolean allowed = ALLOWED_PATH_PREFIXES.stream().anyMatch(endpointPath::startsWith);
        if (!allowed) {
            log.warn("Blocked internal API request to disallowed path: {}", endpointPath);
            throw new SecurityException(
                    "Internal API dispatch not permitted for endpoint: " + endpointPath);
        }
    }

    /** A {@link FileSystemResource} that holds a reference to its backing {@link TempFile}. */
    public static class TempFileResource extends FileSystemResource {
        private final TempFile tempFile;

        public TempFileResource(TempFile tempFile) {
            super(tempFile.getFile());
            this.tempFile = tempFile;
        }

        public TempFile getTempFile() {
            return tempFile;
        }
    }
}
