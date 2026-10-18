package stirling.software.proprietary.accountlink;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.common.service.InternalApiClient;
import stirling.software.proprietary.billing.BillingCategory;
import stirling.software.proprietary.billing.BillingCategoryClassifier;

/**
 * Buckets a request into a {@link BillingCategory} for the account-link gate + meter, using only
 * HTTP-level signals (no dependency on the saas module):
 *
 * <ul>
 *   <li><b>AUTOMATION</b> — the automation marker header ({@link
 *       InternalApiClient#AUTOMATION_HEADER}, set on pipeline / workflow / policy sub-steps);
 *   <li><b>AI</b> - the AI document-tool namespace ({@code /api/v1/ai/tools/**}); the engine's own
 *       surface ({@code /health}, {@code /orchestrate}, {@code /pdf/edit}) is reasoning/health, not
 *       a charged tool - its dispatched tools bill as AUTOMATION via the header, not here;
 *   <li><b>API</b> — an API-key authenticated tool call;
 *   <li><b>BYPASSED</b> — a manual interactive tool call, never billed.
 * </ul>
 *
 * <p>Same precedence as the SaaS classifier (AUTOMATION → AI → API → BYPASSED) via the shared
 * {@link BillingCategoryClassifier}; the AI signal is resolved by path prefix rather than the
 * saas-only {@code @RequiresFeature} annotation. The {@code apiKey} signal is supplied by the
 * caller (resolved from the security context), so this class stays free of any security-type
 * dependency.
 */
public final class BillableOperationClassifier {

    // Only the /tools/ namespace is billable AI, matching the SaaS classifier - not the broader
    // /api/v1/ai/ surface (health, orchestrate, pdf/edit), which must not be charged.
    private static final String AI_PATH_PREFIX = "/api/v1/ai/tools/";

    private BillableOperationClassifier() {}

    /**
     * @param apiKey whether the request authenticated via an API key (an {@code
     *     ApiKeyAuthenticationToken} principal), resolved by the caller from the security context.
     */
    public static BillingCategory categorize(HttpServletRequest request, boolean apiKey) {
        boolean automation = request.getHeader(InternalApiClient.AUTOMATION_HEADER) != null;
        return BillingCategoryClassifier.classify(automation, isAiSurface(request), apiKey);
    }

    private static boolean isAiSurface(HttpServletRequest request) {
        String uri = request.getRequestURI();
        if (uri == null) {
            return false;
        }
        // Prefix-match the AI tool namespace (not a loose substring contains), stripping a
        // deployment context path so /<ctx>/api/v1/ai/tools/** still classifies as AI.
        String ctx = request.getContextPath();
        String path =
                ctx != null && !ctx.isEmpty() && uri.startsWith(ctx)
                        ? uri.substring(ctx.length())
                        : uri;
        return path.startsWith(AI_PATH_PREFIX);
    }
}
