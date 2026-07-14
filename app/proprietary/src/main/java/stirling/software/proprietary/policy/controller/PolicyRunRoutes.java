package stirling.software.proprietary.policy.controller;

import org.springframework.web.servlet.HandlerMapping;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Policy execute-route namespace under {@code /api/v1/policies} - the paths that actually run an
 * automation ({@code /run}, {@code /run/stream}, {@code /{id}/run}, {@code /{id}/trigger}).
 *
 * <p>Single source of truth for both PAYG entitlement gates, so a caller without billing is blocked
 * at the start of a run rather than partway through: the saas {@code EntitlementGuard} gates these
 * on {@code FeatureGate.AUTOMATION}, and the self-hosted account-link {@code
 * InstanceEntitlementInterceptor} treats them as billable. Read/list policy endpoints are
 * deliberately excluded so the UI can still show policies and prompt on use.
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
