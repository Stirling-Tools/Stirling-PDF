package stirling.software.common.service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Duration;
import java.util.regex.Pattern;

// TODO: Migration required - the HTTP dispatch in this class is built entirely on Spring's
// RestTemplate (RestTemplate.execute/httpEntityCallback with SimpleClientHttpRequestFactory,
// RequestCallback, ResponseExtractor and ResourceAccessException). The faithful Quarkus target is
// java.net.http.HttpClient (HttpClient.Builder for the connect/read timeouts, multipart body built
// manually, ConnectException/HttpTimeoutException replacing ResourceAccessException). That rewrite
// is blocked here because the public API surface uses Spring HTTP types that cannot change without
// editing callers:
//   - post(String, MultiValueMap<String, Object>) : ResponseEntity<Resource>
//     is called by, and its MultiValueMap argument / ResponseEntity<Resource> result are consumed
//     by, McpOperationExecutor and PolicyExecutor (app/proprietary) and asserted directly by
//     InternalApiClientTest (which mocks RestTemplate.execute + ResponseExtractor).
//   - ResponseEntity<Resource> -> jakarta.ws.rs.core.Response, MultiValueMap -> a manual
//     Map<String,List<Object>>/form encoding, HttpHeaders/HttpStatus/HttpEntity/MediaType/HttpMethod
//     -> jakarta.ws.rs.core equivalents, all in lockstep with those callers.
// These Spring imports are intentionally retained until that cross-file migration is scheduled;
// they are listed explicitly (no wildcard) so each retained type is auditable.
import stirling.software.common.model.io.FileSystemResource;
import stirling.software.common.model.io.Resource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RequestCallback;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import org.eclipse.microprofile.config.Config;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.servlet.ServletContext;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * Dispatches HTTP POST requests to internal Stirling API endpoints via loopback. Used by
 * PipelineProcessor and AiWorkflowService to execute tool operations programmatically without
 * leaving the JVM network stack.
 */
@ApplicationScoped
@Slf4j
public class InternalApiClient {

    // Allowlist for internal dispatch. Matches fixed namespace prefixes,
    // but rejects traversal (..), URL-encoding (%), query/fragment, backslashes, and any other
    // character that could alter the resolved endpoint on the local server.
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
    private final Config config;
    private final Duration readTimeout;
    private final RestTemplate restTemplate;

    public InternalApiClient(
            ServletContext servletContext,
            Instance<UserServiceInterface> userService,
            TempFileManager tempFileManager,
            Config config,
            ApplicationProperties applicationProperties) {
        this.servletContext = servletContext;
        this.userService = userService.isResolvable() ? userService.get() : null;
        this.tempFileManager = tempFileManager;
        this.config = config;
        ApplicationProperties.InternalApi internalApi = applicationProperties.getInternalApi();
        // A bounded read timeout is what protects the workflow when an internal tool hangs
        // (e.g. an infinite loop in a PDF processing service). The connect timeout is short
        // because this is a loopback call; if connecting takes longer than a few seconds the
        // local server is itself unhealthy.
        this.readTimeout = Duration.ofSeconds(internalApi.getReadTimeoutSeconds());
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(internalApi.getConnectTimeoutSeconds()));
        factory.setReadTimeout(readTimeout);
        this.restTemplate = new RestTemplate(factory);
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

        HttpHeaders headers = new HttpHeaders();
        String apiKey = getApiKeyForUser();
        if (apiKey != null && !apiKey.isEmpty()) {
            headers.add("X-API-KEY", apiKey);
        }

        // A no-file ai/tools call (e.g. create-pdf-from-html-agent) sends only string params, so
        // without this RestTemplate would use urlencoded instead of the multipart the controller
        // expects. File-bearing calls get the right multipart content-type from RestTemplate.
        boolean isAiTool = endpointPath.startsWith("/api/v1/ai/tools/");
        boolean hasFilePart =
                body.values().stream()
                        .flatMap(java.util.List::stream)
                        .anyMatch(v -> v instanceof Resource);
        if (isAiTool && !hasFilePart) {
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        }
        HttpEntity<MultiValueMap<String, Object>> entity = new HttpEntity<>(body, headers);
        RequestCallback requestCallback = restTemplate.httpEntityCallback(entity, Resource.class);

        try {
            return restTemplate.execute(
                    url,
                    HttpMethod.POST,
                    requestCallback,
                    response -> {
                        try {
                            TempFile tempFile =
                                    tempFileManager.createManagedTempFile("internal-api");
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
        } catch (ResourceAccessException e) {
            // RestTemplate wraps low-level I/O failures in ResourceAccessException. Only the
            // SocketTimeoutException-rooted case is a real timeout; other I/O failures (connection
            // refused, DNS, etc.) propagate as-is so the upstream generic handler can describe
            // them accurately.
            if (e.getCause() instanceof java.net.SocketTimeoutException) {
                throw new InternalApiTimeoutException(endpointPath, readTimeout, e);
            }
            throw e;
        }
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
        // actual bound port. The "local.server.port" config key is published once the web server
        // is up; fall back to the configured server.port for early calls (tests, non-web contexts).
        // TODO: Migration required - verify the runtime exposes "local.server.port"/"server.port"
        // via MicroProfile Config under Quarkus (Quarkus uses "quarkus.http.port" and, for
        // random-port test/dev runs, "quarkus.http.test-port"); this lazy port lookup assumed
        // Spring Boot's WebServerInitializedEvent populating "local.server.port".
        String port = config.getOptionalValue("local.server.port", String.class).orElse(null);
        if (port == null) {
            port = config.getOptionalValue("server.port", String.class).orElse("8080");
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
