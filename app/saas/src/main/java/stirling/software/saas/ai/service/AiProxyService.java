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

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.service.UserService;

@Service
@Profile("saas")
@Slf4j
public class AiProxyService {

    private static final String DEFAULT_AI_BASE_URL = "http://localhost:5001";

    private final String aiServiceBaseUrl;

    private final HttpClient httpClient;
    private final UserRepository userRepository;
    private final UserService userService;

    public AiProxyService(
            @Value("${app.ai.service-base-url:" + DEFAULT_AI_BASE_URL + "}")
                    String aiServiceBaseUrl,
            UserRepository userRepository,
            UserService userService) {
        this.aiServiceBaseUrl = aiServiceBaseUrl;
        this.httpClient = HttpClient.newBuilder().build();
        this.userRepository = userRepository;
        this.userService = userService;
    }

    public HttpResponse<InputStream> forward(
            String method, String path, HttpServletRequest request, boolean acceptEventStream)
            throws IOException, InterruptedException {
        String targetUrl = buildTargetUrl(path, request.getQueryString());
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(targetUrl));

        String contentType = request.getContentType();

        String authorization = request.getHeader("Authorization");
        if (authorization != null && !authorization.isBlank()) {
            builder.header("Authorization", authorization);
        }

        // Extract user API key from authenticated user and forward to AI backend
        String apiKey = request.getHeader("X-API-KEY");
        if (apiKey == null || apiKey.isBlank()) {
            apiKey = extractUserApiKey();
        }
        if (apiKey != null && !apiKey.isBlank()) {
            builder.header("X-API-KEY", apiKey);
            log.debug("Forwarding X-API-KEY header to AI backend");
        }

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
        log.debug("Proxying AI request {} {}", method, targetUrl);
        return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
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

    /**
     * Extract the authenticated user's API key from the database. If the user doesn't have an API
     * key, one will be created automatically.
     *
     * @return The user's API key, or null if not authenticated or key creation fails
     */
    private String extractUserApiKey() {
        try {
            // Use getCurrentUsername() which handles all auth types including anonymous users
            String username = userService.getCurrentUsername();
            if (username == null || username.isBlank()) {
                log.debug("No authenticated user found for API key extraction");
                return null;
            }

            // getApiKeyForUser will create a key if it doesn't exist
            String apiKey = userService.getApiKeyForUser(username);
            log.debug("Retrieved API key for user: {}", username);
            return apiKey;
        } catch (Exception e) {
            log.error(
                    "Failed to extract or create user API key for user: {}",
                    userService.getCurrentUsername(),
                    e);
            return null;
        }
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
