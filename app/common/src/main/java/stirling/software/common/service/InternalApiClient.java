package stirling.software.common.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.ConnectException;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.eclipse.microprofile.config.Config;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.servlet.ServletContext;
import jakarta.ws.rs.core.Response;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.io.FileSystemResource;
import stirling.software.common.model.io.Resource;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * Dispatches HTTP POST requests to internal Stirling API endpoints via loopback. Used by
 * PipelineProcessor and AiWorkflowService to execute tool operations programmatically without
 * leaving the JVM network stack.
 *
 * <p>MIGRATION (Spring -> Quarkus): the HTTP dispatch was rebuilt on {@link
 * java.net.http.HttpClient} (replacing Spring's {@code RestTemplate}/{@code
 * SimpleClientHttpRequestFactory}). The multipart body is encoded manually; {@code
 * MultiValueMap<String,Object>} became {@code Map<String,List<Object>>} and {@code
 * ResponseEntity<Resource>} became {@link Response}. {@code ResourceAccessException} timeout
 * handling is now driven by {@link HttpTimeoutException}.
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

    /**
     * Marker propagated on every internal sub-step dispatch so the saas PAYG interceptor classifies
     * the call as {@code BillingCategory.AUTOMATION}. By construction every {@link
     * InternalApiClient#post} caller is an automation surface (pipeline executor, AI workflow,
     * policy runner) running a child tool inside a parent automation flow — see the saas {@code
     * PaygChargeInterceptor.determineCategory} precedence chain, where this header dominates any
     * per-tool {@code @RequiresFeature} annotation.
     */
    public static final String AUTOMATION_HEADER = "X-Stirling-Automation";

    private final ServletContext servletContext;
    private final UserServiceInterface userService;
    private final TempFileManager tempFileManager;
    private final Config config;
    private final Duration readTimeout;
    private final HttpClient httpClient;

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
        this.httpClient =
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(internalApi.getConnectTimeoutSeconds()))
                        .build();
    }

    /**
     * POST to an internal API endpoint. The endpointPath must start with one of the allowed
     * prefixes (e.g. {@code /api/v1/misc/compress-pdf}).
     *
     * @param endpointPath API path (e.g. {@code /api/v1/general/rotate-pdf})
     * @param body multipart form body (fileInput + parameters): each value is either a {@link
     *     Resource} (file part) or a {@code String} (form field)
     * @return JAX-RS {@link Response} with the result file as a {@link TempFileResource} entity
     */
    public Response post(String endpointPath, Map<String, List<Object>> body) {
        validateUrl(endpointPath);
        String url = getBaseUrl() + endpointPath;

        String boundary = "----StirlingBoundary" + Long.toHexString(System.nanoTime());
        byte[] multipartBody = encodeMultipart(body, boundary);

        HttpRequest.Builder requestBuilder =
                HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .timeout(readTimeout)
                        .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                        .POST(HttpRequest.BodyPublishers.ofByteArray(multipartBody));

        String apiKey = getApiKeyForUser();
        if (apiKey != null && !apiKey.isEmpty()) {
            requestBuilder.header("X-API-KEY", apiKey);
        }
        // Tag the sub-step as automation so PAYG bills it under AUTOMATION regardless of which
        // tool-level @RequiresFeature annotation the dispatched controller carries (e.g. an AI-OCR
        // step inside a policy run must bill as AUTOMATION, not AI). Set unconditionally because
        // every caller of this dispatcher is an automation surface by design.
        requestBuilder.header(AUTOMATION_HEADER, "true");

        try {
            HttpResponse<InputStream> response =
                    httpClient.send(
                            requestBuilder.build(), HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream responseBody = response.body()) {
                TempFile tempFile = tempFileManager.createManagedTempFile("internal-api");
                Files.copy(
                        responseBody,
                        tempFile.getPath(),
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                String filename =
                        extractFilename(
                                response.headers().firstValue("Content-Disposition").orElse(null));
                TempFileResource resource = new TempFileResource(tempFile, filename);
                Response.ResponseBuilder rb =
                        Response.status(response.statusCode()).entity(resource);
                response.headers().map().forEach((k, vs) -> vs.forEach(v -> rb.header(k, v)));
                return rb.build();
            }
        } catch (HttpTimeoutException e) {
            throw new InternalApiTimeoutException(endpointPath, readTimeout, e);
        } catch (ConnectException e) {
            throw new UncheckedIOException(new IOException("Internal API connection failed", e));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Internal API dispatch interrupted", e);
        }
    }

    /**
     * Encode a multipart/form-data body. File parts are {@link Resource}; others are form fields.
     */
    private static byte[] encodeMultipart(Map<String, List<Object>> body, String boundary) {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try {
            for (Map.Entry<String, List<Object>> entry : body.entrySet()) {
                String name = entry.getKey();
                for (Object value : entry.getValue()) {
                    baos.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
                    if (value instanceof Resource resource) {
                        String fn = resource.getFilename() != null ? resource.getFilename() : name;
                        baos.write(
                                ("Content-Disposition: form-data; name=\""
                                                + name
                                                + "\"; filename=\""
                                                + fn
                                                + "\"\r\n"
                                                + "Content-Type: application/octet-stream\r\n\r\n")
                                        .getBytes(StandardCharsets.UTF_8));
                        try (InputStream in = resource.getInputStream()) {
                            in.transferTo(baos);
                        }
                        baos.write("\r\n".getBytes(StandardCharsets.UTF_8));
                    } else {
                        baos.write(
                                ("Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n")
                                        .getBytes(StandardCharsets.UTF_8));
                        baos.write(String.valueOf(value).getBytes(StandardCharsets.UTF_8));
                        baos.write("\r\n".getBytes(StandardCharsets.UTF_8));
                    }
                }
            }
            baos.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return baos.toByteArray();
    }

    /**
     * Extract the filename from a {@code Content-Disposition} header value. Returns {@code null} if
     * the header is missing or has no filename.
     */
    private static String extractFilename(String contentDisposition) {
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
        // Resolve the port lazily so desktop mode dispatches to the actual bound port.
        // TODO: Migration required - verify Quarkus exposes the bound port via config. Quarkus uses
        // "quarkus.http.port" and, for random-port test/dev runs, "quarkus.http.test-port"; the old
        // "local.server.port"/"server.port" keys came from Spring Boot's WebServerInitializedEvent.
        String port = config.getOptionalValue("quarkus.http.port", String.class).orElse(null);
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
