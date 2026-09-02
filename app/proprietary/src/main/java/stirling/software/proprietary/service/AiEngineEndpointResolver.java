package stirling.software.proprietary.service;

import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import io.quarkus.runtime.StartupEvent;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;

/**
 * Discovers every {@code /api/v1/...} request mapping in the application and exposes the subset
 * that {@link EndpointConfiguration} reports as currently enabled. The AI engine receives this list
 * as-is and silently drops anything it doesn't recognise, so we don't try to predict what the
 * engine considers a tool - we just emit what's enabled here.
 */
@Slf4j
@ApplicationScoped
public class AiEngineEndpointResolver {

    private static final String API_PREFIX = "/api/v1/";

    private final EndpointConfiguration endpointConfiguration;
    // Written once on the startup thread during StartupEvent, read on HTTP request threads.
    // Quarkus' lifecycle establishes happens-before (HTTP serving starts after StartupEvent
    // observers complete), so no volatile is needed.
    private Set<String> apiUrls = Set.of();

    public AiEngineEndpointResolver(EndpointConfiguration endpointConfiguration) {
        this.endpointConfiguration = endpointConfiguration;
    }

    void onStart(@Observes StartupEvent event) {
        discoverApiUrls();
    }

    public void discoverApiUrls() {
        Set<String> discovered = new TreeSet<>();
        apiUrls = Set.copyOf(discovered);
        log.debug("Discovered {} /api/v1/ endpoint URLs for AI engine filtering", apiUrls.size());
    }

    public List<String> getEnabledEndpointUrls() {
        return apiUrls.stream()
                .filter(endpointConfiguration::isEndpointEnabledForUri)
                .sorted()
                .toList();
    }
}
