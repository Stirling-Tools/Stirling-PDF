package stirling.software.proprietary.service;

import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.function.Consumer;
import java.util.stream.Stream;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@Slf4j
@Service
public class AiEngineClient {

    static final String ENGINE_AUTH_HEADER = "X-Engine-Auth";
    static final String USER_ID_HEADER = "X-User-Id";

    private final ApplicationProperties applicationProperties;
    private final HttpClient httpClient;

    @Autowired
    public AiEngineClient(ApplicationProperties applicationProperties) {
        this(
                applicationProperties,
                HttpClient.newBuilder()
                        .connectTimeout(
                                Duration.ofSeconds(
                                        applicationProperties.getAiEngine().getTimeoutSeconds()))
                        .build());
    }

    /** Package-private constructor that accepts an HttpClient directly; intended for tests. */
    AiEngineClient(ApplicationProperties applicationProperties, HttpClient httpClient) {
        this.applicationProperties = applicationProperties;
        this.httpClient = httpClient;
    }

    @PostConstruct
    void warnIfEngineSecretSentOverPlaintextHttp() {
        String engineSecret = resolveEngineSecret();
        if (engineSecret == null || engineSecret.isBlank()) {
            return;
        }
        String engineUrl = applicationProperties.getAiEngine().getUrl();
        if (engineUrl == null || !engineUrl.startsWith("http://")) {
            return;
        }
        URI uri;
        try {
            uri = URI.create(engineUrl);
        } catch (IllegalArgumentException ex) {
            log.warn(
                    "Engine URL {} could not be parsed; skipping plaintext-secret check",
                    engineUrl);
            return;
        }
        String host = uri.getHost();
        if (host == null || isLoopbackOrPrivateHost(host)) {
            return;
        }
        log.error(
                "SECURITY: engine shared secret will be sent over plaintext HTTP to a non-loopback /"
                        + " non-private-network host: {}. Use https:// for the engine URL in"
                        + " production.",
                engineUrl);
    }

    private static boolean isLoopbackOrPrivateHost(String host) {
        // Cover the literal forms first to avoid a DNS lookup on the common cases.
        if (host.equalsIgnoreCase("localhost")
                || host.equals("127.0.0.1")
                || host.equals("::1")
                || host.equals("0:0:0:0:0:0:0:1")) {
            return true;
        }
        try {
            InetAddress addr = InetAddress.getByName(host);
            if (addr.isLoopbackAddress()
                    || addr.isSiteLocalAddress()
                    || addr.isLinkLocalAddress()) {
                return true;
            }
            byte[] bytes = addr.getAddress();
            if (bytes.length == 4) {
                int b0 = bytes[0] & 0xFF;
                int b1 = bytes[1] & 0xFF;
                // 10/8
                if (b0 == 10) return true;
                // 172.16/12
                if (b0 == 172 && b1 >= 16 && b1 <= 31) return true;
                // 192.168/16
                if (b0 == 192 && b1 == 168) return true;
            }
            return false;
        } catch (UnknownHostException ex) {
            // Cannot resolve - treat as remote so we err on the side of warning.
            return false;
        }
    }

    private HttpRequest.Builder decorate(HttpRequest.Builder builder) {
        String secret = resolveEngineSecret();
        if (secret != null && !secret.isBlank()) {
            builder.header(ENGINE_AUTH_HEADER, secret);
        }
        String userId = resolveUserId();
        if (userId != null && !userId.isBlank()) {
            builder.header(USER_ID_HEADER, userId);
        }
        return builder;
    }

    private String resolveEngineSecret() {
        ApplicationProperties.Cluster cluster = applicationProperties.getCluster();
        if (cluster == null || cluster.getEngine() == null) {
            return "";
        }
        return cluster.getEngine().getSharedSecret();
    }

    private String resolveUserId() {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth == null
                    || !auth.isAuthenticated()
                    || auth instanceof AnonymousAuthenticationToken) {
                return null;
            }
            Object principal = auth.getPrincipal();
            if (principal instanceof UserDetails ud) {
                return ud.getUsername();
            }
            return auth.getName();
        } catch (RuntimeException ex) {
            return null;
        }
    }

    public String post(String path, String jsonBody) throws IOException {
        ApplicationProperties.AiEngine config = applicationProperties.getAiEngine();
        return postWithTimeout(path, jsonBody, Duration.ofSeconds(config.getTimeoutSeconds()));
    }

    /** POST with an explicit per-call timeout for heavy operations (e.g. RAG ingestion). */
    public String postLongRunning(String path, String jsonBody) throws IOException {
        ApplicationProperties.AiEngine config = applicationProperties.getAiEngine();
        return postWithTimeout(
                path, jsonBody, Duration.ofSeconds(config.getLongRunningTimeoutSeconds()));
    }

    private String postWithTimeout(String path, String jsonBody, Duration timeout)
            throws IOException {
        ApplicationProperties.AiEngine config = applicationProperties.getAiEngine();
        if (!config.isEnabled()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine is not enabled");
        }

        String url = config.getUrl().stripTrailing() + path;
        log.debug("Proxying AI engine request to {} (timeout {}s)", url, timeout.toSeconds());

        HttpRequest request =
                decorate(
                                HttpRequest.newBuilder()
                                        .uri(URI.create(url))
                                        .header("Content-Type", "application/json")
                                        .header("Accept", "application/json")
                                        .timeout(timeout)
                                        .POST(HttpRequest.BodyPublishers.ofString(jsonBody)))
                        .build();

        HttpResponse<String> response = sendRequest(request);

        log.debug("AI engine responded with status {}", response.statusCode());
        checkResponseStatus(response);
        return response.body();
    }

    /** POST a JSON body and consume the response as a stream of NDJSON lines. */
    public void streamPost(String path, String jsonBody, Consumer<String> lineConsumer)
            throws IOException {
        ApplicationProperties.AiEngine config = applicationProperties.getAiEngine();
        if (!config.isEnabled()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine is not enabled");
        }

        String url = config.getUrl().stripTrailing() + path;
        Duration timeout = Duration.ofSeconds(config.getLongRunningTimeoutSeconds());
        log.debug(
                "Proxying AI engine streaming request to {} (timeout {}s)",
                url,
                timeout.toSeconds());

        HttpRequest request =
                decorate(
                                HttpRequest.newBuilder()
                                        .uri(URI.create(url))
                                        .header("Content-Type", "application/json")
                                        .header("Accept", "application/x-ndjson")
                                        .timeout(timeout)
                                        .POST(HttpRequest.BodyPublishers.ofString(jsonBody)))
                        .build();

        HttpResponse<Stream<String>> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofLines());
        } catch (HttpTimeoutException e) {
            throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, "AI engine timed out", e);
        } catch (IOException e) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine unreachable: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine request was interrupted");
        }

        int status = response.statusCode();
        if (status >= 400) {
            throw new ResponseStatusException(
                    HttpStatus.valueOf(status >= 500 ? 502 : status),
                    "AI engine returned error: " + status);
        }

        try (Stream<String> lines = response.body()) {
            lines.forEach(
                    line -> {
                        if (!line.isEmpty()) {
                            lineConsumer.accept(line);
                        }
                    });
        }
    }

    public String get(String path) throws IOException {
        ApplicationProperties.AiEngine config = applicationProperties.getAiEngine();
        if (!config.isEnabled()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine is not enabled");
        }

        String url = config.getUrl().stripTrailing() + path;
        log.debug("Proxying AI engine GET request to {}", url);

        HttpRequest request =
                decorate(
                                HttpRequest.newBuilder()
                                        .uri(URI.create(url))
                                        .header("Accept", "application/json")
                                        .timeout(Duration.ofSeconds(config.getTimeoutSeconds()))
                                        .GET())
                        .build();

        HttpResponse<String> response = sendRequest(request);

        log.debug("AI engine responded with status {}", response.statusCode());
        checkResponseStatus(response);
        return response.body();
    }

    private HttpResponse<String> sendRequest(HttpRequest request) throws IOException {
        try {
            return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (HttpTimeoutException e) {
            throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, "AI engine timed out", e);
        } catch (IOException e) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine unreachable: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine request was interrupted");
        }
    }

    private void checkResponseStatus(HttpResponse<String> response) {
        int status = response.statusCode();
        if (status >= 500) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "AI engine returned error: " + status);
        }
        if (status >= 400) {
            throw new ResponseStatusException(
                    HttpStatus.valueOf(status),
                    "AI engine returned client error: " + response.body());
        }
    }
}
