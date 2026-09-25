package stirling.software.saas.accountlink;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.service.AiEngineRouter;
import stirling.software.proprietary.service.AiEngineTarget;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Forwards a linked instance's AI call to this deployment's engine as {@code instance:<id>:<user>}.
 * The engine treats owners as opaque, so that prefix keeps tenants apart.
 */
@Slf4j
@Service
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class InstanceAiGatewayService {

    /** OpenAPI extension the engine puts on each route a linked instance may call. */
    static final String LINKED_INSTANCE_MARKER = "x-linked-instance";

    private static final Duration ROUTES_TTL = Duration.ofMinutes(5);
    private static final List<String> OWNER_FIELDS =
            List.of("ownerId", "owner_id", "readPrincipals", "read_principals");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final ApplicationProperties applicationProperties;
    private final AiEngineRouter router;
    private final HttpClient httpClient;
    private volatile Routes routes = new Routes(List.of(), Instant.MIN);

    @Autowired
    public InstanceAiGatewayService(
            ApplicationProperties applicationProperties, AiEngineRouter router) {
        this(
                applicationProperties,
                router,
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
    }

    InstanceAiGatewayService(
            ApplicationProperties applicationProperties,
            AiEngineRouter router,
            HttpClient httpClient) {
        this.applicationProperties = applicationProperties;
        this.router = router;
        this.httpClient = httpClient;
    }

    /** The owner the engine sees; the prefix comes from the credential, never the instance. */
    public static String namespacedOwner(Long instanceId, String instanceUserId) {
        String user =
                instanceUserId == null || instanceUserId.isBlank() ? "anonymous" : instanceUserId;
        return "instance:" + instanceId + ":" + user;
    }

    /** Whether the engine answers its health check: enough to tell switched off from broken. */
    public boolean engineReachable() {
        try {
            HttpRequest request = engineRequest("/health", Duration.ofSeconds(5)).GET().build();
            return httpClient.send(request, HttpResponse.BodyHandlers.discarding()).statusCode()
                    < 400;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } catch (IOException | RuntimeException e) {
            log.debug("Cloud AI engine health probe failed", e);
            return false;
        }
    }

    /** Forwards one call as the instance's owner; 404 unless the engine marks the route. */
    public EngineReply forward(
            String method,
            String path,
            String query,
            String body,
            Long instanceId,
            String instanceUserId)
            throws IOException, InterruptedException {
        if (currentRoutes().stream().noneMatch(route -> route.matches(method, path))) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Not an AI engine route this gateway forwards: " + method + " " + path);
        }
        String owner = namespacedOwner(instanceId, instanceUserId);
        String target = path + (query == null || query.isBlank() ? "" : "?" + query);
        // One long timeout for all calls: it only lasts until headers arrive, and the instance
        // times each call itself.
        Duration timeout =
                Duration.ofSeconds(
                        applicationProperties.getAiEngine().getLongRunningTimeoutSeconds());
        HttpRequest.Builder builder = engineRequest(target, timeout).header("X-User-Id", owner);
        switch (method) {
            case "POST" ->
                    builder.header("Content-Type", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofString(stampOwner(body, owner)));
            case "DELETE" -> builder.DELETE();
            default -> builder.GET();
        }
        HttpResponse<InputStream> response =
                httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
        log.debug(
                "Cloud AI gateway forwarded {} {} for instance {} -> {}",
                method,
                path,
                instanceId,
                response.statusCode());
        return new EngineReply(
                response.statusCode(),
                response.headers().firstValue("Content-Type").orElse("application/json"),
                response.body());
    }

    /**
     * Replaces any owner fields in a JSON body with {@code owner}. Document ingest stores under the
     * body's owner, not {@code X-User-Id}, so a forged one could overwrite another tenant.
     */
    static String stampOwner(String body, String owner) {
        if (body == null || body.isBlank()) {
            return "{}";
        }
        JsonNode parsed;
        try {
            parsed = JSON.readTree(body);
        } catch (JacksonException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Malformed JSON body");
        }
        if (!(parsed instanceof ObjectNode node) || OWNER_FIELDS.stream().noneMatch(node::has)) {
            return body;
        }
        node.remove(OWNER_FIELDS);
        node.put("ownerId", owner);
        node.putArray("readPrincipals").add(owner);
        return JSON.writeValueAsString(node);
    }

    /** The marked operations in an engine OpenAPI document. */
    static List<EngineRoute> parseRoutes(JsonNode openApi) {
        List<EngineRoute> found = new ArrayList<>();
        for (Map.Entry<String, JsonNode> path : openApi.path("paths").properties()) {
            for (Map.Entry<String, JsonNode> operation : path.getValue().properties()) {
                if (operation.getValue().path(LINKED_INSTANCE_MARKER).asBoolean(false)) {
                    found.add(EngineRoute.of(operation.getKey(), path.getKey()));
                }
            }
        }
        return List.copyOf(found);
    }

    // Unlocked on purpose: a slow engine would otherwise queue every call behind one fetch.
    private List<EngineRoute> currentRoutes() throws IOException, InterruptedException {
        Routes cached = routes;
        if (cached.isFresh()) {
            return cached.list();
        }
        try {
            routes = new Routes(fetchRoutes(), Instant.now());
        } catch (IOException | JacksonException e) {
            if (cached.list().isEmpty()) {
                throw e;
            }
            log.warn("Engine route refresh failed; keeping the previous list", e);
            routes = new Routes(cached.list(), Instant.now());
        }
        return routes.list();
    }

    private List<EngineRoute> fetchRoutes() throws IOException, InterruptedException {
        HttpRequest request = engineRequest("/openapi.json", Duration.ofSeconds(10)).GET().build();
        HttpResponse<String> response =
                httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IOException("Engine OpenAPI document returned HTTP " + response.statusCode());
        }
        return parseRoutes(JSON.readTree(response.body()));
    }

    private HttpRequest.Builder engineRequest(String pathAndQuery, Duration timeout) {
        AiEngineTarget engine = router.selfHostedTarget();
        HttpRequest.Builder builder =
                HttpRequest.newBuilder()
                        .uri(URI.create(engine.urlFor(pathAndQuery)))
                        .timeout(timeout);
        engine.headers().forEach(builder::header);
        return builder;
    }

    public record EngineReply(int status, String contentType, InputStream body) {}

    /** A marked engine operation; each {@code {param}} matches one segment other than . or .. */
    record EngineRoute(String method, Pattern path) {

        static EngineRoute of(String method, String template) {
            StringBuilder regex = new StringBuilder();
            for (String part : template.split("(?=\\{)|(?<=\\})")) {
                regex.append(
                        part.startsWith("{") ? "(?!\\.\\.?(?:/|$))[^/]+" : Pattern.quote(part));
            }
            return new EngineRoute(
                    method.toUpperCase(Locale.ROOT), Pattern.compile(regex.toString()));
        }

        boolean matches(String requestMethod, String requestPath) {
            return method.equals(requestMethod) && path.matcher(requestPath).matches();
        }
    }

    private record Routes(List<EngineRoute> list, Instant fetchedAt) {
        boolean isFresh() {
            return Instant.now().isBefore(fetchedAt.plus(ROUTES_TTL));
        }
    }
}
