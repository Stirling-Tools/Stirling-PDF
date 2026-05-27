package stirling.software.saas.ai.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.Part;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.service.UserService;

/**
 * Proxies saas-side HTTP requests to the AI engine and enforces the auth-header contract:
 *
 * <ul>
 *   <li>Client-supplied {@code Authorization} and {@code X-API-KEY} are stripped; the server-
 *       resolved API key is stamped so callers cannot spoof identity downstream.
 *   <li>{@code X-Engine-Auth} is stamped when the cluster shared secret is configured.
 *   <li>{@code X-User-Id} is stamped for authenticated principals; omitted for anonymous.
 * </ul>
 */
@Service
@Profile("saas")
@Slf4j
public class AiProxyService {

    private static final String DEFAULT_AI_BASE_URL = "http://localhost:5001";

    private static final String ENGINE_AUTH_HEADER = "X-Engine-Auth";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String API_KEY_HEADER = "X-API-KEY";
    private static final String AUTHORIZATION_HEADER = "Authorization";

    private final String aiServiceBaseUrl;

    private final HttpClient httpClient;
    private final UserRepository userRepository;
    private final UserService userService;
    private final ApplicationProperties applicationProperties;

    public AiProxyService(
            @Value("${app.ai.service-base-url:" + DEFAULT_AI_BASE_URL + "}")
                    String aiServiceBaseUrl,
            UserRepository userRepository,
            UserService userService,
            ApplicationProperties applicationProperties) {
        this.aiServiceBaseUrl = aiServiceBaseUrl;
        this.httpClient = HttpClient.newBuilder().build();
        this.userRepository = userRepository;
        this.userService = userService;
        this.applicationProperties = applicationProperties;
    }

    public HttpResponse<InputStream> forward(
            String method, String path, HttpServletRequest request, boolean acceptEventStream)
            throws IOException, InterruptedException {
        String targetUrl = buildTargetUrl(path, request.getQueryString());
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(targetUrl));

        String contentType = request.getContentType();

        String accept = request.getHeader("Accept");
        if (acceptEventStream) {
            builder.header("Accept", "text/event-stream");
        } else if (accept != null && !accept.isBlank()) {
            builder.header("Accept", accept);
        }

        BodyPublisherWithContentType body = buildBodyPublisher(method, request, contentType);
        if (body.contentType != null && !body.contentType.isBlank()) {
            builder.header("Content-Type", body.contentType);
        } else if (contentType != null && !contentType.isBlank()) {
            builder.header("Content-Type", contentType);
        }
        builder.method(method, body.publisher);

        // INVARIANT: stamp auth headers LAST. setHeader() overrides any previously-set value,
        // including any caller-supplied Authorization / X-API-KEY that arrived via this proxy.
        // Any .header(...) call AFTER this point would defeat the strip-on-output guarantee.
        stampAuthHeaders(builder);

        log.debug("Proxying AI request {} {}", method, targetUrl);
        return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
    }

    private void stampAuthHeaders(HttpRequest.Builder builder) {
        // setHeader (not header) with empty string causes the JDK builder to omit the header
        // entirely in the built request, dropping any caller-supplied value.
        builder.setHeader(AUTHORIZATION_HEADER, "");

        String apiKey = extractUserApiKey();
        if (apiKey != null && !apiKey.isBlank()) {
            builder.setHeader(API_KEY_HEADER, apiKey);
            log.debug("Attaching server-resolved X-API-KEY for the engine call");
        } else {
            builder.setHeader(API_KEY_HEADER, "");
        }

        String engineSecret = resolveEngineSecret();
        if (engineSecret != null && !engineSecret.isBlank()) {
            builder.setHeader(ENGINE_AUTH_HEADER, engineSecret);
        }

        try {
            String username = userService.getCurrentUsername();
            if (username != null && !username.isBlank() && !"anonymousUser".equals(username)) {
                builder.setHeader(USER_ID_HEADER, username);
            }
        } catch (RuntimeException ex) {
            log.warn("Could not resolve current username for X-User-Id header", ex);
        }
    }

    private String resolveEngineSecret() {
        ApplicationProperties.Cluster cluster = applicationProperties.getCluster();
        if (cluster == null || cluster.getEngine() == null) {
            return "";
        }
        return cluster.getEngine().getSharedSecret();
    }

    private String extractUserApiKey() {
        try {
            String username = userService.getCurrentUsername();
            if (username == null || username.isBlank()) {
                log.debug("No authenticated user found for API key extraction");
                return null;
            }
            String apiKey = userService.getApiKeyForUser(username);
            log.debug("Retrieved API key for user: {}", username);
            return apiKey;
        } catch (Exception e) {
            log.error("Failed to extract or create user API key", e);
            return null;
        }
    }

    private String buildTargetUrl(String path, String queryString) {
        String baseUrl = aiServiceBaseUrl;
        if (baseUrl == null || baseUrl.isBlank()) {
            baseUrl = DEFAULT_AI_BASE_URL;
        }
        baseUrl = baseUrl.trim();
        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        }
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        String url = baseUrl + path;
        if (queryString != null && !queryString.isBlank()) {
            url += "?" + queryString;
        }
        return url;
    }

    private BodyPublisherWithContentType buildBodyPublisher(
            String method, HttpServletRequest request, String contentType) throws IOException {
        if ("GET".equalsIgnoreCase(method) || "DELETE".equalsIgnoreCase(method)) {
            return new BodyPublisherWithContentType(HttpRequest.BodyPublishers.noBody(), null);
        }
        if (contentType != null && contentType.startsWith("multipart/form-data")) {
            String boundary = "----spdf-" + UUID.randomUUID().toString().replace("-", "");
            byte[] body = buildMultipartBody(request, boundary);
            return new BodyPublisherWithContentType(
                    HttpRequest.BodyPublishers.ofByteArray(body),
                    "multipart/form-data; boundary=" + boundary);
        }
        return new BodyPublisherWithContentType(
                HttpRequest.BodyPublishers.ofInputStream(
                        () -> {
                            try {
                                return request.getInputStream();
                            } catch (IOException exc) {
                                throw new UncheckedIOException(exc);
                            }
                        }),
                null);
    }

    private byte[] buildMultipartBody(HttpServletRequest request, String boundary)
            throws IOException {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            for (Part part : request.getParts()) {
                writeLine(output, "--" + boundary);
                String name = part.getName();
                String filename = part.getSubmittedFileName();
                if (filename != null && !filename.isBlank()) {
                    writeLine(
                            output,
                            "Content-Disposition: form-data; name=\""
                                    + name
                                    + "\"; filename=\""
                                    + filename
                                    + "\"");
                } else {
                    writeLine(output, "Content-Disposition: form-data; name=\"" + name + "\"");
                }
                String partContentType = part.getContentType();
                if (partContentType != null && !partContentType.isBlank()) {
                    writeLine(output, "Content-Type: " + partContentType);
                }
                writeLine(output, "");
                try (InputStream input = part.getInputStream()) {
                    input.transferTo(output);
                }
                writeLine(output, "");
            }
            writeLine(output, "--" + boundary + "--");
            writeLine(output, "");
            return output.toByteArray();
        } catch (Exception exc) {
            if (exc instanceof IOException) {
                throw (IOException) exc;
            }
            throw new IOException("Failed to proxy multipart request", exc);
        }
    }

    private void writeLine(ByteArrayOutputStream output, String value) throws IOException {
        output.write(value.getBytes(StandardCharsets.UTF_8));
        output.write("\r\n".getBytes(StandardCharsets.UTF_8));
    }

    private static class BodyPublisherWithContentType {
        private final HttpRequest.BodyPublisher publisher;
        private final String contentType;

        private BodyPublisherWithContentType(
                HttpRequest.BodyPublisher publisher, String contentType) {
            this.publisher = publisher;
            this.contentType = contentType;
        }
    }
}
