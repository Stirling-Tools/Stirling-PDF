package stirling.software.proprietary.security.filter;

import java.io.IOException;
import java.util.Set;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.configuration.ee.DatabaseLicenseGuard;

/** Restricts an unlicensed external database to reading, setup and account/licence recovery. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 21)
@RequiredArgsConstructor
public class DatabaseLicenseFilter extends OncePerRequestFilter {
    private static final Set<String> LICENCE_PATHS =
            Set.of(
                    "/api/v1/admin/license-key",
                    "/api/v1/admin/license/resync",
                    "/api/v1/admin/license-file",
                    "/api/v1/user/change-password",
                    "/api/v1/user/change-password-on-login",
                    "/api/v1/user/change-username");
    private final DatabaseLicenseGuard guard;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        if (!path.startsWith("/api/")
                || Set.of("GET", "HEAD", "OPTIONS").contains(request.getMethod())
                || path.startsWith("/api/v1/auth/")
                || path.startsWith("/api/v1/account-link/")
                || path.startsWith("/api/v1/admin/settings/")
                || LICENCE_PATHS.contains(path)
                || !guard.requiresActivation()) {
            chain.doFilter(request, response);
            return;
        }
        response.setStatus(HttpServletResponse.SC_PAYMENT_REQUIRED);
        response.setContentType("application/json");
        response.getWriter()
                .write(
                        "{\"error\":\"SERVER_PLAN_REQUIRED\",\"message\":\"Link a paid Team account or install a Server or Enterprise licence to use this database.\"}");
    }
}
