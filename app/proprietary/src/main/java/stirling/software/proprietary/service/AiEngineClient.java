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

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.billing.AiCallRecord;

@Slf4j
@Service
public class AiEngineClient {

    /** The one route that makes Stirling Cloud keep a document past the request. */
    private static final String DOCUMENT_INGEST_PATH = "/api/v1/documents";

    private final ApplicationProperties applicationProperties;
    private final HttpClient httpClient;
    private final AiEngineRouter router;

    @Autowired
    public AiEngineClient(ApplicationProperties applicationProperties, AiEngineRouter router) {
        this(
                applicationProperties,
                HttpClient.newBuilder()
                        .connectTimeout(
                                Duration.ofSeconds(
                                        applicationProperties.getAiEngine().getTimeoutSeconds()))
                        .build(),
                router);
    }

    public AiEngineClient(
            ApplicationProperties applicationProperties,
            HttpClient httpClient,
            AiEngineRouter router) {
        this.applicationProperties = applicationProperties;
        this.httpClient = httpClient;
        this.router = router;
    }

    // The cloud retention check lives here so every engine call, new ones included, passes it.
    private AiEngineTarget resolveTarget(String path) {
        AiEngineTarget target = router.resolve();
        if (target.cloud()
                && DOCUMENT_INGEST_PATH.equals(path)
                && !router.documentIndexingAllowed()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Storing documents on Stirling Cloud is turned off on this server, so"
                            + " document questions are unavailable in cloud AI mode.");
        }
        return target;
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
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine is not enabled");
        }

        AiEngineTarget target = resolveTarget(path);
        String url = target.urlFor(path);
        log.debug("Proxying AI engine request to {} (timeout {}s)", url, timeout.toSeconds());

        HttpRequest.Builder builder =
                HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/json")
                        .timeout(timeout)
                        .POST(HttpRequest.BodyPublishers.ofString(jsonBody));
        addUserHeader(builder, userId);
        addEngineAuthHeader(builder, target);
        HttpResponse<String> response = sendRequest(builder.build(), target);

        log.debug("AI engine responded with status {}", response.statusCode());
        checkResponseStatus(response);
        return response.body();
    }

    private static void addEngineAuthHeader(HttpRequest.Builder builder, AiEngineTarget target) {
        target.headers().forEach(builder::header);
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
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine is not enabled");
        }

        AiEngineTarget target = resolveTarget(path);
        String url = target.urlFor(path);
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
        addEngineAuthHeader(builder, target);
        HttpRequest request = builder.build();

        HttpResponse<Stream<String>> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofLines());
            recordWhereItRan(target);
        } catch (HttpTimeoutException e) {
            throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, "AI engine timed out", e);
        } catch (IOException e) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine unreachable: " + describe(e), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine request was interrupted");
        }

        int status = response.statusCode();
        if (status >= 400) {
            throw failureFor(status, null);
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
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine is not enabled");
        }

        AiEngineTarget target = resolveTarget(path);
        String url = target.urlFor(path);
        log.debug("Proxying AI engine DELETE request to {}", url);

        HttpRequest.Builder builder =
                HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .header("Accept", "application/json")
                        .timeout(Duration.ofSeconds(config.getTimeoutSeconds()))
                        .DELETE();
        addUserHeader(builder, userId);
        addEngineAuthHeader(builder, target);
        HttpResponse<String> response = sendRequest(builder.build(), target);

        log.debug("AI engine responded with status {}", response.statusCode());
        checkResponseStatus(response);
        return response.body();
    }

    public String get(String path, String userId) throws IOException {
        return get(
                path,
                userId,
                Duration.ofSeconds(applicationProperties.getAiEngine().getTimeoutSeconds()));
    }

    /** GET with its own timeout, which also bounds the connect, so a probe cannot hang. */
    public String get(String path, String userId, Duration timeout) throws IOException {
        ApplicationProperties.AiEngine config = applicationProperties.getAiEngine();
        if (!config.isEnabled()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine is not enabled");
        }

        AiEngineTarget target = resolveTarget(path);
        String url = target.urlFor(path);
        log.debug("Proxying AI engine GET request to {}", url);

        HttpRequest.Builder builder =
                HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .header("Accept", "application/json")
                        .timeout(timeout)
                        .GET();
        addUserHeader(builder, userId);
        addEngineAuthHeader(builder, target);
        HttpResponse<String> response = sendRequest(builder.build(), target);

        log.debug("AI engine responded with status {}", response.statusCode());
        checkResponseStatus(response);
        return response.body();
    }

    /** The JDK's ConnectException has no message, which would render as "unreachable: null". */
    private static String describe(Exception e) {
        String message = e.getMessage();
        return message != null && !message.isBlank()
                ? message
                : e.getClass().getSimpleName() + " (nothing listening on the configured URL?)";
    }

    // Any answer counts, failures included: the meter skips failed requests on their status.
    private static void recordWhereItRan(AiEngineTarget target) {
        AiCallRecord.record(target.cloud() ? AiCallRecord.Where.REMOTE : AiCallRecord.Where.LOCAL);
    }

    private HttpResponse<String> sendRequest(HttpRequest request, AiEngineTarget target)
            throws IOException {
        try {
            HttpResponse<String> response =
                    httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            recordWhereItRan(target);
            return response;
        } catch (HttpTimeoutException e) {
            throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, "AI engine timed out", e);
        } catch (IOException e) {
            // Connection refused, DNS failure, socket reset, etc. — surface as
            // SERVICE_UNAVAILABLE so every caller of this client sees a structured
            // status rather than a raw 500 from an unhandled IOException.
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine unreachable: " + describe(e), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI engine request was interrupted");
        }
    }

    private void checkResponseStatus(HttpResponse<String> response) {
        int status = response.statusCode();
        if (status >= 400) {
            throw failureFor(status, response.body());
        }
    }

    /**
     * An upstream 401/403 is about this server's credentials; relayed as-is, the frontend would
     * treat it as its own session expiring and reload mid-flow.
     */
    private static ResponseStatusException failureFor(int status, String body) {
        if (status == 401 || status == 403) {
            return new EngineRejectedCredentials(status);
        }
        if (status >= 500) {
            return new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "AI engine returned error: " + status);
        }
        String detail = body == null || body.isBlank() ? "" : ": " + body;
        return new ResponseStatusException(
                HttpStatus.valueOf(status),
                "AI engine returned client error (HTTP " + status + ")" + detail);
    }

    /** The engine, or the cloud gateway in front of it, refused this server's own credentials. */
    public static final class EngineRejectedCredentials extends ResponseStatusException {
        private final int upstreamStatus;

        EngineRejectedCredentials(int upstreamStatus) {
            super(
                    HttpStatus.BAD_GATEWAY,
                    "AI engine rejected this server's credentials (HTTP " + upstreamStatus + ")");
            this.upstreamStatus = upstreamStatus;
        }

        public int upstreamStatus() {
            return upstreamStatus;
        }
    }
}
