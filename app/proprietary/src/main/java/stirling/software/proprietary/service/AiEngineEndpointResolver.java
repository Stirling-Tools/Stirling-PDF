package stirling.software.proprietary.service;

import java.io.IOException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Resolves the set of AI engine endpoint URLs that should be marked as disabled for a given
 * request. The engine publishes its full set of known URLs at {@code /api/v1/known-endpoints};
 * this service fetches it lazily, caches it, and returns the URLs that {@link
 * EndpointConfiguration} reports as disabled.
 */
@Slf4j
@Service
public class AiEngineEndpointResolver {

    private static final String KNOWN_ENDPOINTS_PATH = "/api/v1/known-endpoints";

    private final EndpointConfiguration endpointConfiguration;
    private final AiEngineClient aiEngineClient;
    private final ObjectMapper objectMapper;
    private volatile Set<String> engineKnownUrls = null;

    public AiEngineEndpointResolver(
            EndpointConfiguration endpointConfiguration,
            AiEngineClient aiEngineClient,
            ObjectMapper objectMapper) {
        this.endpointConfiguration = endpointConfiguration;
        this.aiEngineClient = aiEngineClient;
        this.objectMapper = objectMapper;
    }

    public List<String> getDisabledEndpointUrls() {
        return engineKnownEndpointUrls().stream()
                .filter(url -> !endpointConfiguration.isEndpointEnabledForUri(url))
                .sorted()
                .toList();
    }

    private Set<String> engineKnownEndpointUrls() {
        Set<String> cached = engineKnownUrls;
        if (cached != null) {
            return cached;
        }
        synchronized (this) {
            if (engineKnownUrls != null) {
                return engineKnownUrls;
            }
            Set<String> fetched = fetchEngineKnownUrls();
            if (fetched != null) {
                engineKnownUrls = Set.copyOf(fetched);
            }
            return engineKnownUrls != null ? engineKnownUrls : Set.of();
        }
    }

    private Set<String> fetchEngineKnownUrls() {
        try {
            String body = aiEngineClient.get(KNOWN_ENDPOINTS_PATH);
            JsonNode root = objectMapper.readValue(body, JsonNode.class);
            JsonNode endpoints = root.get("endpoints");
            if (endpoints == null || !endpoints.isArray()) {
                log.warn("AI engine known-endpoints response missing endpoints array: {}", body);
                return null;
            }
            Set<String> urls = new HashSet<>();
            for (JsonNode node : endpoints) {
                if (node.isString()) {
                    urls.add(node.asString());
                }
            }
            return urls;
        } catch (IOException e) {
            log.warn("Failed to fetch AI engine known endpoints; will retry on next call", e);
            return null;
        }
    }
}
