package stirling.software.SPDF.config;

import java.util.HashSet;
import java.util.Set;
import java.util.TreeSet;

import io.quarkus.runtime.StartupEvent;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@ApplicationScoped
@RequiredArgsConstructor
@Slf4j
public class EndpointInspector {

    private final Set<String> validGetEndpoints = new HashSet<>();
    private boolean endpointsDiscovered = false;

    void onStart(@Observes StartupEvent event) {
        if (!endpointsDiscovered) {
            discoverEndpoints();
            endpointsDiscovered = true;
        }
    }

    private void discoverEndpoints() {
        try {
            // TODO: Migration required - this previously used Spring MVC's
            // RequestMappingHandlerMapping (org.springframework.web.servlet.mvc.method.*) to
            // enumerate all registered GET handler mappings via the ApplicationContext at
            // ContextRefreshedEvent. Quarkus/JAX-RS (RESTEasy Reactive) has no equivalent
            // runtime-queryable handler-mapping registry. Options for porting:
            //   - Build-time scan of @jakarta.ws.rs.Path + @jakarta.ws.rs.GET via a Quarkus
            //     build step / Jandex index, or
            //   - Query the OpenAPI model (quarkus-smallrye-openapi) for GET paths, or
            //   - Maintain an explicit allow-list.
            // Until one of the above is implemented, no endpoints are discovered and we fall
            // back to the common wildcard endpoints below (preserving prior fallback behavior).

            if (validGetEndpoints.isEmpty()) {
                log.warn("No endpoints discovered. Adding common endpoints as fallback.");
                validGetEndpoints.add("/");
                validGetEndpoints.add("/api/**");
                validGetEndpoints.add("/**");
            }
        } catch (Exception e) {
            log.error("Error discovering endpoints", e);
        }
    }

    public boolean isValidGetEndpoint(String uri) {
        if (!endpointsDiscovered) {
            discoverEndpoints();
            endpointsDiscovered = true;
        }

        if (validGetEndpoints.contains(uri)) {
            return true;
        }

        if (matchesWildcardOrPathVariable(uri)) {
            return true;
        }

        if (matchesPathSegments(uri)) {
            return true;
        }

        return false;
    }

    private boolean matchesWildcardOrPathVariable(String uri) {
        for (String pattern : validGetEndpoints) {
            if (pattern.contains("*") || pattern.contains("{")) {
                int wildcardIndex = pattern.indexOf('*');
                int variableIndex = pattern.indexOf('{');

                int cutoffIndex;
                if (wildcardIndex < 0) {
                    cutoffIndex = variableIndex;
                } else if (variableIndex < 0) {
                    cutoffIndex = wildcardIndex;
                } else {
                    cutoffIndex = Math.min(wildcardIndex, variableIndex);
                }

                String staticPrefix = pattern.substring(0, cutoffIndex);

                if (uri.startsWith(staticPrefix)) {
                    return true;
                }
            }
        }
        return false;
    }

    private boolean matchesPathSegments(String uri) {
        for (String pattern : validGetEndpoints) {
            if (!pattern.contains("*") && !pattern.contains("{")) {
                String[] patternSegments = pattern.split("/");
                String[] uriSegments = uri.split("/");

                if (uriSegments.length < patternSegments.length) {
                    continue;
                }

                boolean match = true;
                for (int i = 0; i < patternSegments.length; i++) {
                    if (!patternSegments[i].equals(uriSegments[i])) {
                        match = false;
                        break;
                    }
                }

                if (match) {
                    return true;
                }
            }
        }
        return false;
    }

    public Set<String> getValidGetEndpoints() {
        if (!endpointsDiscovered) {
            discoverEndpoints();
            endpointsDiscovered = true;
        }
        return new HashSet<>(validGetEndpoints);
    }

    private void logAllEndpoints() {
        Set<String> sortedEndpoints = new TreeSet<>(validGetEndpoints);

        log.info("=== BEGIN: All discovered GET endpoints ===");
        for (String endpoint : sortedEndpoints) {
            log.info("Endpoint: {}", endpoint);
        }
        log.info("=== END: All discovered GET endpoints ===");
    }
}
