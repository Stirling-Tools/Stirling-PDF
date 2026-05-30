package stirling.software.saas.ai.service;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.service.UserService;

@Service
@Profile("saas")
@Slf4j
public class AiCreateProxyService {

    private static final String DEFAULT_AI_BASE_URL = "http://localhost:5001";

    private final String aiServiceBaseUrl;

    private final HttpClient httpClient;
    private final UserRepository userRepository;
    private final UserService userService;

    public AiCreateProxyService(
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
        if (contentType != null && !contentType.isBlank()) {
            builder.header("Content-Type", contentType);
        }

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

        builder.method(method, buildBodyPublisher(method, request));
        log.debug("Proxying AI create request {} {}", method, targetUrl);
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

    private HttpRequest.BodyPublisher buildBodyPublisher(
            String method, HttpServletRequest request) {
        if ("GET".equalsIgnoreCase(method) || "DELETE".equalsIgnoreCase(method)) {
            return HttpRequest.BodyPublishers.noBody();
        }
        return HttpRequest.BodyPublishers.ofInputStream(
                () -> {
                    try {
                        return request.getInputStream();
                    } catch (IOException exc) {
                        throw new UncheckedIOException(exc);
                    }
                });
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
}
