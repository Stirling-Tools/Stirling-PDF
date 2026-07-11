package stirling.software.proprietary.security.filter;

import java.util.Set;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;

/**
 * Confines a processing-only API key to the file/PDF endpoints. A key the creator marked {@code
 * PROCESSING} (and every shared team key is processing-only) may call the tool namespaces below and
 * nothing else - any account, team, admin or portal-management request is rejected with 403.
 *
 * <p>This is the single, additive boundary the whole shared-key model rests on: because a shared
 * key can never leave the data plane, it can never carry the owner's account powers no matter which
 * filter authenticated it or what role the owner holds. Full-access and legacy keys are unaffected.
 */
@Slf4j
@Component
public class ApiKeyProcessingScopeInterceptor implements HandlerInterceptor {

    /**
     * The file/PDF processing namespaces a processing-only key may reach. Deliberately an allowlist
     * (default-deny): a new management endpoint is blocked automatically, and the worst a missing
     * tool prefix can do is 403 a legitimate processing call - never widen access.
     */
    private static final Set<String> ALLOWED_PREFIXES =
            Set.of(
                    "/api/v1/general",
                    "/api/v1/convert",
                    "/api/v1/misc",
                    "/api/v1/filter",
                    "/api/v1/analysis",
                    "/api/v1/pipeline",
                    "/api/v1/security",
                    "/api/v1/form",
                    "/api/v1/info",
                    "/api/v1/mobile-scanner");

    @Override
    public boolean preHandle(
            HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof ApiKeyAuthenticationToken token) || !token.isProcessingOnly()) {
            return true;
        }

        String path = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (contextPath != null && !contextPath.isEmpty() && path.startsWith(contextPath)) {
            path = path.substring(contextPath.length());
        }

        if (isProcessingPath(path)) {
            return true;
        }

        log.debug("Processing-only API key blocked from non-tool endpoint {}", path);
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        response.getWriter()
                .write(
                        "{\"error\":\"Forbidden\",\"message\":\"This API key is limited to"
                                + " file/PDF processing endpoints.\",\"status\":403}");
        return false;
    }

    private static boolean isProcessingPath(String path) {
        for (String prefix : ALLOWED_PREFIXES) {
            if (path.equals(prefix) || path.startsWith(prefix + "/")) {
                return true;
            }
        }
        return false;
    }
}
