package stirling.software.saas.accountlink;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import lombok.extern.slf4j.Slf4j;

/**
 * Forwards a linked instance's AI call to the engine Stirling Cloud runs.
 *
 * <p>Tenancy is carried in the owner id rather than in the engine. The engine's {@code OwnerId} is
 * an opaque string it never parses, and every document read already resolves through its ACL by
 * owner, so prefixing the instance id is enough to keep two customers' corpora apart without the
 * engine knowing instances exist. Two servers that both have a user called "admin" get
 * {@code instance:1:admin} and {@code instance:2:admin}.
 *
 * <p>The instance is never trusted for identity: the caller-supplied {@code X-User-Id} becomes the
 * suffix, and the prefix comes from the device credential the request authenticated with.
 */
@Slf4j
@Service
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class InstanceAiGatewayService {

    /**
     * Engine paths a linked instance may reach. An allowlist, not a block list: the engine's config
     * route would let an instance repoint Stirling Cloud's models, and its owner-purge route is
     * reachable by construction, so a new engine route is opt-in rather than opt-out.
     */
    private static final Set<String> ALLOWED_PATHS =
            Set.of(
                    "/health",
                    "/api/v1/agents/capabilities",
                    "/api/v1/agents/draft",
                    "/api/v1/agents/revise",
                    "/api/v1/agents/next-action",
                    "/api/v1/orchestrator",
                    "/api/v1/pdf/edit",
                    "/api/v1/pdf/questions",
                    "/api/v1/documents",
                    // Safe despite deleting by owner: the owner is the namespace this gateway
                    // derives from the credential, so an instance can only purge its own. Without
                    // it a user's documents would outlive their logout on Stirling's side.
                    "/api/v1/documents/by-owner",
                    "/api/v1/documents/classify",
                    "/api/v1/ai/math-auditor-agent/examine",
                    "/api/v1/ai/math-auditor-agent/deliberate",
                    "/api/v1/ai/pdf-comment-agent/generate");

    /** Paths whose response is streamed rather than buffered, so progress arrives as it happens. */
    private static final Set<String> STREAMING_PATHS = Set.of("/api/v1/orchestrator");

    /**
     * Paths whose work is measured in minutes: ingesting a whole document, and an orchestrator run
     * that reasons over one. The default timeout is sized for a single question, so without this
     * the gateway would cut off exactly the calls the instance allows the longest for.
     */
    private static final Set<String> LONG_RUNNING_PATHS =
            Set.of("/api/v1/documents", "/api/v1/orchestrator");

    private final HttpClient httpClient;
    private final String engineBaseUrl;
    private final String engineSharedSecret;
    private final int timeoutSeconds;
    private final int longRunningTimeoutSeconds;

    @Autowired
    public InstanceAiGatewayService(
            @Value("${stirling.cloud-ai.engine-url:http://localhost:5001}") String engineBaseUrl,
            @Value("${stirling.cloud-ai.timeout-seconds:120}") int timeoutSeconds,
            @Value("${stirling.cloud-ai.long-running-timeout-seconds:1800}")
                    int longRunningTimeoutSeconds) {
        this(
                engineBaseUrl,
                timeoutSeconds,
                longRunningTimeoutSeconds,
                System.getenv("STIRLING_ENGINE_SHARED_SECRET"),
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
    }

    /** Package-private: lets tests inject a stub engine and secret. */
    InstanceAiGatewayService(
            String engineBaseUrl,
            int timeoutSeconds,
            int longRunningTimeoutSeconds,
            String engineSharedSecret,
            HttpClient httpClient) {
        this.engineBaseUrl = engineBaseUrl == null ? "" : engineBaseUrl.strip().replaceAll("/+$", "");
        this.timeoutSeconds = timeoutSeconds;
        this.longRunningTimeoutSeconds = longRunningTimeoutSeconds;
        this.engineSharedSecret = engineSharedSecret;
        this.httpClient = httpClient;
    }

    /** The owner the engine sees. Built here, never taken from the instance. */
    public static String namespacedOwner(Long instanceId, String instanceUserId) {
        String user = instanceUserId == null || instanceUserId.isBlank() ? "anonymous" : instanceUserId;
        return "instance:" + instanceId + ":" + user;
    }

    public static boolean isAllowedPath(String path) {
        return path != null && ALLOWED_PATHS.contains(path);
    }

    /** True for the one path that uploads whole documents, which an instance may forbid. */
    public static boolean isDocumentUpload(String path) {
        return "/api/v1/documents".equals(path);
    }

    public EngineReply forward(
            String method, String path, String body, Long instanceId, String instanceUserId)
            throws IOException, InterruptedException {
        HttpResponse<String> response =
                httpClient.send(
                        buildRequest(method, path, body, instanceId, instanceUserId),
                        HttpResponse.BodyHandlers.ofString());
        log.debug(
                "Cloud AI gateway forwarded {} {} for instance {} -> {}",
                method,
                path,
                instanceId,
                response.statusCode());
        return new EngineReply(response.statusCode(), response.body());
    }

    private HttpRequest buildRequest(
            String method, String path, String body, Long instanceId, String instanceUserId) {
        if (!isAllowedPath(path)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "Not an AI engine route this gateway forwards: " + path);
        }
        HttpRequest.Builder builder =
                HttpRequest.newBuilder()
                        .uri(URI.create(engineBaseUrl + path))
                        .timeout(Duration.ofSeconds(timeoutFor(path)))
                        .header("Accept", "application/json")
                        .header("X-User-Id", namespacedOwner(instanceId, instanceUserId));
        if (engineSharedSecret != null && !engineSharedSecret.isBlank()) {
            builder.header("X-Engine-Auth", engineSharedSecret);
        }
        if ("POST".equals(method)) {
            builder.header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body == null ? "{}" : body));
        } else if ("DELETE".equals(method)) {
            // The logout-time RAG purge is a DELETE; without this it would 405 at the gateway and
            // the documents would quietly stay.
            builder.DELETE();
        } else {
            builder.GET();
        }

        return builder.build();
    }

    public static boolean isStreaming(String path) {
        return STREAMING_PATHS.contains(path);
    }

    private int timeoutFor(String path) {
        return LONG_RUNNING_PATHS.contains(path) ? longRunningTimeoutSeconds : timeoutSeconds;
    }

    /**
     * Same call, streamed rather than buffered. The orchestrator emits NDJSON progress frames for
     * the length of a run; buffering them would hand the instance every frame at the end, which is
     * the same as having no progress at all.
     */
    public StreamedReply forwardStreaming(
            String method, String path, String body, Long instanceId, String instanceUserId)
            throws IOException, InterruptedException {
        HttpRequest request = buildRequest(method, path, body, instanceId, instanceUserId);
        HttpResponse<java.io.InputStream> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
        return new StreamedReply(response.statusCode(), response.body());
    }

    public record EngineReply(int status, String body) {}

    public record StreamedReply(int status, java.io.InputStream body) {}
}
