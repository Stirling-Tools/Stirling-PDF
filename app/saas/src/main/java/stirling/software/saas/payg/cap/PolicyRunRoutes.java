package stirling.software.saas.payg.cap;

import org.springframework.web.servlet.HandlerMapping;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Policy execute-route namespace under {@code /api/v1/policies}.
 *
 * <p>The policy controllers live in the {@code proprietary} module, which does not depend on {@code
 * saas} and so cannot carry the saas-only {@link RequiresFeature} annotation. As with {@link
 * AiToolRoutes}, the PAYG hot-path recognises the routes by path instead: {@code EntitlementGuard}
 * gates them on {@link stirling.software.saas.payg.model.FeatureGate#AUTOMATION}.
 *
 * <p>Only the execute paths are matched - {@code /run}, {@code /run/stream}, {@code /{id}/run},
 * {@code /{id}/trigger} - so listing/reading policies stays ungated and the UI can still show them
 * and prompt to sign up on use.
 */
public final class PolicyRunRoutes {

    private static final String BASE = "/api/v1/policies";

    private PolicyRunRoutes() {}

    /**
     * True when the request resolved to a policy execute endpoint. Prefers the matched route
     * pattern (context-path independent, set by Spring MVC) and falls back to the raw request URI.
     */
    public static boolean matches(HttpServletRequest request) {
        Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        String path = pattern instanceof String s ? s : request.getRequestURI();
        if (path == null) {
            return false;
        }
        int base = path.indexOf(BASE);
        if (base < 0) {
            return false;
        }
        // Relative to the controller base: "/run", "/run/stream", "/{policyId}/run",
        // "/{policyId}/trigger". endsWith("/run") also matches the ad-hoc "/run"; the GET status
        // route "/run/{runId}" and the "/runs" list end differently and are left ungated.
        String rel = path.substring(base + BASE.length());
        return rel.equals("/run/stream") || rel.endsWith("/run") || rel.endsWith("/trigger");
    }
}
