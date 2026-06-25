package stirling.software.proprietary.accountlink;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.common.service.InternalApiClient;

/**
 * Classifies a request as <b>billable</b> (AI / automation) or free (a manual tool).
 *
 * <p>Mirrors the saas billing categorisation at a coarse level, without depending on the saas
 * module: billable = the AI surface ({@code /api/v1/ai/**}) or any request carrying the automation
 * marker header ({@link InternalApiClient#AUTOMATION_HEADER}, set on pipeline / workflow / policy
 * sub-steps). Everything else — interactive manual PDF tools — is always free.
 */
public final class BillableOperationClassifier {

    private static final String AI_PATH_PREFIX = "/api/v1/ai/";

    private BillableOperationClassifier() {}

    public static boolean isBillable(HttpServletRequest request) {
        if (request.getHeader(InternalApiClient.AUTOMATION_HEADER) != null) {
            return true;
        }
        String uri = request.getRequestURI();
        if (uri == null) {
            return false;
        }
        // Prefix-match the AI surface (not a loose substring contains), stripping a deployment
        // context path so /<ctx>/api/v1/ai/** still classifies as billable.
        String ctx = request.getContextPath();
        String path =
                ctx != null && !ctx.isEmpty() && uri.startsWith(ctx)
                        ? uri.substring(ctx.length())
                        : uri;
        return path.startsWith(AI_PATH_PREFIX);
    }
}
