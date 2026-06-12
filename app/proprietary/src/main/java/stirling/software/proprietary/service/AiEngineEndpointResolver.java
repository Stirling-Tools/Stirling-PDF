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
        // TODO: Migration required - this previously enumerated all registered request mappings
        // via Spring MVC's RequestMappingHandlerMapping
        // (org.springframework.web.servlet.mvc.method.*) obtained from the ApplicationContext at
        // ContextRefreshedEvent, keeping every pattern that started with "/api/v1/". Quarkus /
        // JAX-RS (RESTEasy Reactive) has no equivalent runtime-queryable handler-mapping registry.
        // Options for porting:
        //   - Build-time scan of @jakarta.ws.rs.Path methods via a Quarkus build step / Jandex
        //     index, exposing the discovered "/api/v1/" paths as a startup bean, or
        //   - Query the OpenAPI model (quarkus-smallrye-openapi) for "/api/v1/" paths, or
        //   - Maintain an explicit allow-list.
        // Until one of the above is implemented, no endpoints are discovered and the enabled-URL
        // list will be empty (preserving the safe "engine drops what it doesn't recognise"
        // contract described above).
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
