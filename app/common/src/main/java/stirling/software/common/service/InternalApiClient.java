package stirling.software.common.service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
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

    // Allowlist for internal dispatch. Matches fixed namespace prefixes,
    // but rejects traversal (..), URL-encoding (%), query/fragment, backslashes, and any other
    // character that could alter the resolved endpoint on the local Spring server.
    //
    // The second alternation carves out `/api/v1/ai/tools/*` specifically — AI tools are
    // dispatchable, but the broader `/api/v1/ai/` surface (orchestrate, health, etc.) is
    // intentionally NOT permitted to avoid plan steps re-entering the orchestrator.
    private static final Pattern ALLOWED_ENDPOINT_PATH =
            Pattern.compile(
                    "^/api/v1/(general|misc|security|convert|filter)(/[A-Za-z0-9_-]+)+$"
                            + "|^/api/v1/ai/tools(/[A-Za-z0-9_-]+)+$");

    private final ServletContext servletContext;
    private final UserServiceInterface userService;
    private final TempFileManager tempFileManager;
    private final Environment environment;

    public InternalApiClient(
            ServletContext servletContext,
            @Autowired(required = false) UserServiceInterface userService,
            TempFileManager tempFileManager,
            Environment environment) {
        this.servletContext = servletContext;
        this.userService = userService;
        this.tempFileManager = tempFileManager;
        this.environment = environment;
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
                        String filename = extractFilename(response.getHeaders());
                        TempFileResource resource = new TempFileResource(tempFile, filename);
                        return ResponseEntity.status(response.getStatusCode())
                                .headers(response.getHeaders())
                                .body(resource);
                    } catch (IOException e) {
                        throw new UncheckedIOException(e);
                    }
                });
    }

    /**
     * Extract the filename from a response's {@code Content-Disposition} header. Returns {@code
     * null} if the header is missing or has no filename.
     */
    private static String extractFilename(HttpHeaders headers) {
        String contentDisposition = headers.getFirst(HttpHeaders.CONTENT_DISPOSITION);
        if (contentDisposition == null || contentDisposition.isBlank()) {
            return null;
        }
        for (String part : contentDisposition.split(";")) {
            String trimmed = part.trim();
            if (trimmed.startsWith("filename")) {
                String[] kv = trimmed.split("=", 2);
                if (kv.length != 2) {
                    continue;
                }
                String value = kv[1].trim().replace("\"", "");
                return URLDecoder.decode(value, StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private String getBaseUrl() {
        // Resolve the port lazily so desktop mode (server.port=0, OS-assigned) dispatches to the
        // actual bound port. Spring publishes local.server.port once the web server is up; fall
        // back to the configured server.port for early calls (tests, non-web contexts).
        String port = environment.getProperty("local.server.port");
        if (port == null) {
            port = environment.getProperty("server.port", "8080");
        }
        return "http://localhost:" + port + servletContext.getContextPath();
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
        if (endpointPath == null || !ALLOWED_ENDPOINT_PATH.matcher(endpointPath).matches()) {
            log.warn("Blocked internal API request to disallowed path: {}", endpointPath);
            throw new SecurityException(
                    "Internal API dispatch not permitted for endpoint: " + endpointPath);
        }
    }

    /**
     * A {@link FileSystemResource} that holds a reference to its backing {@link TempFile}.
     *
     * <p>If a display filename is supplied (typically parsed from the upstream response's {@code
     * Content-Disposition} header), it is returned from {@link #getFilename()} instead of the
     * underlying temp file's path-based name.
     */
    public static class TempFileResource extends FileSystemResource {
        private final TempFile tempFile;
        private final String displayFilename;

        public TempFileResource(TempFile tempFile) {
            this(tempFile, null);
        }

        public TempFileResource(TempFile tempFile, String displayFilename) {
            super(tempFile.getFile());
            this.tempFile = tempFile;
            this.displayFilename = displayFilename;
        }

        public TempFile getTempFile() {
            return tempFile;
        }

        @Override
        public String getFilename() {
            return displayFilename != null ? displayFilename : super.getFilename();
        }
    }
}
