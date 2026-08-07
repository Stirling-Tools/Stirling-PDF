package stirling.software.proprietary.mcp.engine;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Pulls the engine's capabilities manifest at boot and on a schedule, feeding it into the shared
 * {@link McpToolCatalog}.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class EngineCapabilityClient {

    private final ApplicationProperties applicationProperties;
    private final McpToolCatalog catalog;
    private final ObjectMapper mapper;
    private final HttpClient httpClient;
    private final String sharedSecret;

    private ScheduledExecutorService scheduler;

    public EngineCapabilityClient(
            ApplicationProperties applicationProperties,
            McpToolCatalog catalog,
            ObjectMapper mapper) {
        this.applicationProperties = applicationProperties;
        this.catalog = catalog;
        this.mapper = mapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        this.sharedSecret = System.getenv("STIRLING_ENGINE_SHARED_SECRET");
    }

    @PostConstruct
    void start() {
        scheduler =
                Executors.newSingleThreadScheduledExecutor(
                        r -> {
                            Thread t = new Thread(r, "mcp-engine-capability-refresh");
                            t.setDaemon(true);
                            return t;
                        });
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        long minutes =
                Math.max(1, applicationProperties.getMcp().getEngineCapabilityRefreshMinutes());
        // First refresh immediately, then on the configured cadence.
        scheduler.schedule(this::refreshSafely, 0, TimeUnit.SECONDS);
        scheduler.scheduleAtFixedRate(this::refreshSafely, minutes, minutes, TimeUnit.MINUTES);
        log.info("MCP engine capability refresh scheduled every {} minute(s)", minutes);
    }

    @PreDestroy
    void stop() {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
    }

    private void refreshSafely() {
        try {
            refresh();
        } catch (Exception e) {
            log.warn(
                    "MCP engine capability refresh failed ({}). AI tool enum stays at the last"
                            + " known state until the next successful pull.",
                    e.getMessage());
        }
    }

    /** Visible for testing. */
    public void refresh() throws IOException, InterruptedException {
        if (!applicationProperties.getAiEngine().isEnabled()) {
            log.debug("AI engine disabled; skipping MCP capability refresh");
            catalog.replaceAiCapabilities(Map.of());
            return;
        }
        // Trim whitespace and any trailing slash to avoid a malformed URI.
        String base = applicationProperties.getAiEngine().getUrl().strip().replaceAll("/+$", "");
        URI uri = URI.create(base + "/api/v1/agents/capabilities");
        HttpRequest.Builder reqBuilder =
                HttpRequest.newBuilder()
                        .uri(uri)
                        .timeout(Duration.ofSeconds(10))
                        .header("Accept", "application/json")
                        .GET();
        if (sharedSecret != null && !sharedSecret.isBlank()) {
            reqBuilder.header("X-Engine-Auth", sharedSecret);
        }
        HttpResponse<String> response =
                httpClient.send(reqBuilder.build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IOException(
                    "Engine capabilities endpoint returned HTTP " + response.statusCode());
        }
        Map<String, OperationMeta> parsed = parseManifest(response.body());
        catalog.replaceAiCapabilities(parsed);
    }

    private Map<String, OperationMeta> parseManifest(String body) throws IOException {
        JsonNode root = mapper.readTree(body);
        JsonNode capabilities = root.get("capabilities");
        if (capabilities == null || !capabilities.isArray()) {
            throw new IOException("Manifest missing 'capabilities' array");
        }
        Map<String, OperationMeta> out = new LinkedHashMap<>();
        for (JsonNode entry : capabilities) {
            JsonNode id = entry.get("id");
            JsonNode desc = entry.get("description");
            JsonNode schema = entry.get("input_schema");
            JsonNode scope = entry.get("required_scope");
            JsonNode route = entry.get("route");
            if (id == null || !id.isTextual() || schema == null || !schema.isObject()) {
                log.warn("Skipping malformed capability entry: {}", entry);
                continue;
            }
            String routeValue = route == null || !route.isTextual() ? null : route.asText();
            if (routeValue != null && !isSafeRelativeRoute(routeValue)) {
                // Defence in depth: a tampered manifest must not steer Java at an arbitrary
                // host/path.
                log.warn(
                        "Skipping capability '{}' with unsafe route '{}' (must be a server-relative"
                                + " /api path with no scheme, authority, or '..')",
                        id.asText(),
                        routeValue);
                continue;
            }
            // Fail safe: default to the stricter write scope when the manifest omits one.
            String requiredScope =
                    scope != null && scope.isTextual() && !scope.asText().isBlank()
                            ? scope.asText()
                            : WRITE_SCOPE;
            ObjectNode schemaCopy = (ObjectNode) schema.deepCopy();
            out.put(
                    id.asText(),
                    new OperationMeta(
                            id.asText(),
                            OperationCategory.AI,
                            desc == null ? id.asText() : desc.asText(),
                            schemaCopy,
                            requiredScope,
                            OperationMeta.Target.ENGINE_CAPABILITY,
                            routeValue,
                            null));
        }
        return out;
    }

    private static final String WRITE_SCOPE = "mcp.tools.write";

    /**
     * True only for a server-relative {@code /api/} path with no scheme, authority, {@code ..}, or
     * control chars (blocks SSRF / path escape).
     */
    static boolean isSafeRelativeRoute(String route) {
        if (route == null || route.isBlank() || !route.startsWith("/api/")) {
            return false;
        }
        if (route.startsWith("//")
                || route.contains("..")
                || route.contains("@")
                || route.contains("\\")
                || route.contains(":")) {
            return false;
        }
        for (int i = 0; i < route.length(); i++) {
            char c = route.charAt(i);
            if (c <= ' ') {
                return false;
            }
        }
        return true;
    }
}
