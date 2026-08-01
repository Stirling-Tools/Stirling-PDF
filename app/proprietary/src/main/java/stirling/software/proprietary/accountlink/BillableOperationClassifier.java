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
 *   <li><b>AI</b> — the AI surface ({@code /api/v1/ai/**});
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

    private static final String AI_PATH_PREFIX = "/api/v1/ai/";

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
        // Prefix-match the AI surface (not a loose substring contains), stripping a deployment
        // context path so /<ctx>/api/v1/ai/** still classifies as AI.
        String ctx = request.getContextPath();
        String path =
                ctx != null && !ctx.isEmpty() && uri.startsWith(ctx)
                        ? uri.substring(ctx.length())
                        : uri;
        return path.startsWith(AI_PATH_PREFIX);
    }
}
