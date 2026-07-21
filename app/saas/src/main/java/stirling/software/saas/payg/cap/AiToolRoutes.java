package stirling.software.saas.payg.cap;

import org.springframework.web.servlet.HandlerMapping;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Central definition of the AI document-tool route namespace ({@code /api/v1/ai/tools/**}).
 *
 * <p>These tools (e.g. {@code PdfCommentAgentController}, {@code MathAuditorAgentController}) live
 * in the {@code proprietary} module, which does not depend on {@code saas} and therefore cannot
 * carry the saas-only {@link RequiresFeature} annotation. Rather than weaken the layering, the PAYG
 * hot-path components recognise the path prefix instead:
 *
 * <ul>
 *   <li>{@code PaygChargeInterceptor} brings these routes into scope and bills them as {@code
 *       BillingCategory.AI} on a direct call (an orchestrator-dispatched call still resolves to
 *       AUTOMATION first, via the {@code X-Stirling-Automation} header);
 *   <li>{@code EntitlementGuard} gates them on {@link
 *       stirling.software.saas.payg.model.FeatureGate#AI_SUPPORT}.
 * </ul>
 *
 * <p>Kept as a single source of truth so the interceptor and the guard can never drift on what
 * counts as an AI tool.
 */
public final class AiToolRoutes {

    /** Trailing slash so it matches the tool sub-paths, not a bare {@code /api/v1/ai/tools}. */
    public static final String PREFIX = "/api/v1/ai/tools/";

    private AiToolRoutes() {}

    /**
     * True when the request resolved to an AI document-tool endpoint. Prefers the matched route
     * pattern (context-path independent, set by Spring MVC) and falls back to the raw request URI.
     */
    public static boolean matches(HttpServletRequest request) {
        Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        String path = pattern instanceof String s ? s : request.getRequestURI();
        return path != null && path.startsWith(PREFIX);
    }
}
