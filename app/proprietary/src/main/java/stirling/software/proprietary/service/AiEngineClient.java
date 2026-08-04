package stirling.software.proprietary.service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.function.Consumer;
import java.util.stream.Stream;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@Slf4j
@ApplicationScoped
public class AiEngineClient {

    private final ApplicationProperties applicationProperties;
    private final HttpClient httpClient;
    private final String engineSharedSecret;

    @Inject
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
        this(applicationProperties, httpClient, System.getenv("STIRLING_ENGINE_SHARED_SECRET"));
    }

    /** Package-private constructor that also injects the engine shared secret; for tests. */
    AiEngineClient(
            ApplicationProperties applicationProperties,
            HttpClient httpClient,
            String engineSharedSecret) {
        this.applicationProperties = applicationProperties;
        this.httpClient = httpClient;
        this.engineSharedSecret = engineSharedSecret;
    }

    public String post(String path, String jsonBody, String userId) throws IOException {
        ApplicationProperties.AiEngine config = applicationProperties.getAiEngine();
        return postWithTimeout(
                path, jsonBody, Duration.ofSeconds(config.getTimeoutSeconds()), userId);
    }

    /**
     * POST with an explicit per-call timeout, for heavy operations (e.g. RAG ingestion of a large
     * document) that legitimately take longer than the default timeout.
     */
    public String postLongRunning(String path, String jsonBody, String userId) throws IOException {
        ApplicationProperties.AiEngine config = applicationProperties.getAiEngine();
        return postWithTimeout(
                path, jsonBody, Duration.ofSeconds(config.getLongRunningTimeoutSeconds()), userId);
    }

    private String postWithTimeout(String path, String jsonBody, Duration timeout, String userId)
            throws IOException {
        ApplicationProperties.AiEngine config = applicationProperties.getAiEngine();
        if (!config.isEnabled()) {
            throw new WebApplicationException(
                    "AI engine is not enabled", Response.Status.SERVICE_UNAVAILABLE);
        }

        String url = config.getUrl().stripTrailing() + path;
        log.debug("Proxying AI engine request to {} (timeout {}s)", url, timeout.toSeconds());

        HttpRequest.Builder builder =
                HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/json")
                        .timeout(timeout)
                        .POST(HttpRequest.BodyPublishers.ofString(jsonBody));
        addUserHeader(builder, userId);
        addEngineAuthHeader(builder);
        HttpResponse<String> response = sendRequest(builder.build());

        log.debug("AI engine responded with status {}", response.statusCode());
        checkResponseStatus(response);
        return response.body();
    }

    /**
     * Attach the {@code X-Engine-Auth} shared secret when configured so the engine trusts this
     * backend request.
     */
    private void addEngineAuthHeader(HttpRequest.Builder builder) {
        if (engineSharedSecret != null && !engineSharedSecret.isBlank()) {
            builder.header("X-Engine-Auth", engineSharedSecret);
        }
    }

    private static void addUserHeader(HttpRequest.Builder builder, String userId) {
        if (userId != null && !userId.isBlank()) {
            builder.header("X-User-Id", userId);
        }
    }

    /**
     * POST a JSON body and consume the response as a stream of NDJSON lines. Each line is passed to
     * {@code lineConsumer} in arrival order; the call returns when the engine closes the stream.
     *
     * <p>This is the right shape for long-running orchestrator calls that emit incremental
     * progress. The total HTTP timeout is the long-running timeout (typically 600s+), but in
     * practice line arrival keeps the connection logically alive: as long as the engine emits
     * events, the work is progressing. Genuine engine hangs still hit the total timeout.
     */
    public void streamPost(
            String path, String jsonBody, String userId, Consumer<String> lineConsumer)
            throws IOException {
        ApplicationProperties.AiEngine config = applicationProperties.getAiEngine();
        if (!config.isEnabled()) {
            throw new WebApplicationException(
                    "AI engine is not enabled", Response.Status.SERVICE_UNAVAILABLE);
        }

        String url = config.getUrl().stripTrailing() + path;
        Duration timeout = Duration.ofSeconds(config.getLongRunningTimeoutSeconds());
        log.debug(
                "Proxying AI engine streaming request to {} (timeout {}s)",
                url,
                timeout.toSeconds());

        HttpRequest.Builder builder =
                HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/x-ndjson")
                        .timeout(timeout)
                        .POST(HttpRequest.BodyPublishers.ofString(jsonBody));
        addUserHeader(builder, userId);
        addEngineAuthHeader(builder);
        HttpRequest request = builder.build();

        HttpResponse<Stream<String>> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofLines());
        } catch (HttpTimeoutException e) {
            throw new WebApplicationException(
                    "AI engine timed out", e, Response.Status.GATEWAY_TIMEOUT);
        } catch (IOException e) {
            throw new WebApplicationException(
                    "AI engine unreachable: " + e.getMessage(),
                    e,
                    Response.Status.SERVICE_UNAVAILABLE);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WebApplicationException(
                    "AI engine request was interrupted", Response.Status.SERVICE_UNAVAILABLE);
        }

        int status = response.statusCode();
        if (status >= 400) {
            throw new WebApplicationException(
                    "AI engine returned error: " + status, status >= 500 ? 502 : status);
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

    /**
     * DELETE with no body. Used for purging the caller's RAG content on logout. Wraps the same
     * error envelope as {@link #post} / {@link #get} so callers see a consistent set of {@code
     * ResponseStatusException}s.
     */
    public String delete(String path, String userId) throws IOException {
        ApplicationProperties.AiEngine config = applicationProperties.getAiEngine();
        if (!config.isEnabled()) {
            throw new WebApplicationException(
                    "AI engine is not enabled", Response.Status.SERVICE_UNAVAILABLE);
        }

        String url = config.getUrl().stripTrailing() + path;
        log.debug("Proxying AI engine DELETE request to {}", url);

        HttpRequest.Builder builder =
                HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .header("Accept", "application/json")
                        .timeout(Duration.ofSeconds(config.getTimeoutSeconds()))
                        .DELETE();
        addUserHeader(builder, userId);
        addEngineAuthHeader(builder);
        HttpResponse<String> response = sendRequest(builder.build());

        log.debug("AI engine responded with status {}", response.statusCode());
        checkResponseStatus(response);
        return response.body();
    }

    public String get(String path, String userId) throws IOException {
        ApplicationProperties.AiEngine config = applicationProperties.getAiEngine();
        if (!config.isEnabled()) {
            throw new WebApplicationException(
                    "AI engine is not enabled", Response.Status.SERVICE_UNAVAILABLE);
        }

        String url = config.getUrl().stripTrailing() + path;
        log.debug("Proxying AI engine GET request to {}", url);

        HttpRequest.Builder builder =
                HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .header("Accept", "application/json")
                        .timeout(Duration.ofSeconds(config.getTimeoutSeconds()))
                        .GET();
        addUserHeader(builder, userId);
        addEngineAuthHeader(builder);
        HttpResponse<String> response = sendRequest(builder.build());

        log.debug("AI engine responded with status {}", response.statusCode());
        checkResponseStatus(response);
        return response.body();
    }

    private HttpResponse<String> sendRequest(HttpRequest request) throws IOException {
        try {
            return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (HttpTimeoutException e) {
            throw new WebApplicationException(
                    "AI engine timed out", e, Response.Status.GATEWAY_TIMEOUT);
        } catch (IOException e) {
            // Connection refused, DNS failure, socket reset, etc. — surface as
            // SERVICE_UNAVAILABLE so every caller of this client sees a structured
            // status rather than a raw 500 from an unhandled IOException.
            throw new WebApplicationException(
                    "AI engine unreachable: " + e.getMessage(),
                    e,
                    Response.Status.SERVICE_UNAVAILABLE);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WebApplicationException(
                    "AI engine request was interrupted", Response.Status.SERVICE_UNAVAILABLE);
        }
    }

    private void checkResponseStatus(HttpResponse<String> response) {
        int status = response.statusCode();
        if (status >= 500) {
            throw new WebApplicationException(
                    "AI engine returned error: " + status, Response.Status.BAD_GATEWAY);
        }
        if (status >= 400) {
            // status is a known 4xx client error code; pass it through directly.
            throw new WebApplicationException(
                    "AI engine returned client error: " + response.body(), status);
        }
    }
}
