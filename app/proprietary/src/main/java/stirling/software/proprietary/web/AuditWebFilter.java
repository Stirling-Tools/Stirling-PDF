package stirling.software.proprietary.web;

import java.io.IOException;
import java.util.Map;

import org.slf4j.MDC;

import io.quarkus.security.identity.SecurityIdentity;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

/** Filter that stores additional request information for audit purposes */
// Servlet filter retained (quarkus-undertow). Spring's OncePerRequestFilter replaced by a plain
// jakarta.servlet.Filter registered as a CDI bean via @WebFilter so it covers all requests.
// TODO: Migration required - Spring's @Order(Ordered.HIGHEST_PRECEDENCE + 10) ordering has no
// direct @WebFilter equivalent; if this filter must run before other servlet filters, configure
// ordering explicitly (e.g. via a FilterRegistrationBean equivalent / quarkus.http.filter.* in
// application.properties).
@Slf4j
@ApplicationScoped
@WebFilter("/*")
public class AuditWebFilter implements jakarta.servlet.Filter {

    private static final String USER_AGENT_HEADER = "User-Agent";
    private static final String REFERER_HEADER = "Referer";
    private static final String ACCEPT_LANGUAGE_HEADER = "Accept-Language";
    private static final String CONTENT_TYPE_HEADER = "Content-Type";

    // Instance<> so the filter still works on unauthenticated requests where no identity is bound.
    @Inject Instance<SecurityIdentity> securityIdentity;

    @Override
    public void doFilter(
            ServletRequest servletRequest, ServletResponse servletResponse, FilterChain filterChain)
            throws ServletException, IOException {

        HttpServletRequest request = (HttpServletRequest) servletRequest;

        // Store key request info in MDC for logging and later audit use
        try {
            // Store request headers
            String userAgent = request.getHeader(USER_AGENT_HEADER);
            if (userAgent != null) {
                MDC.put("userAgent", userAgent);
            }

            String referer = request.getHeader(REFERER_HEADER);
            if (referer != null) {
                MDC.put("referer", referer);
            }

            String acceptLanguage = request.getHeader(ACCEPT_LANGUAGE_HEADER);
            if (acceptLanguage != null) {
                MDC.put("acceptLanguage", acceptLanguage);
            }

            String contentType = request.getHeader(CONTENT_TYPE_HEADER);
            if (contentType != null) {
                MDC.put("contentType", contentType);
            }

            // Store authenticated user roles if available
            if (securityIdentity.isResolvable()) {
                SecurityIdentity identity = securityIdentity.get();
                if (identity != null && !identity.isAnonymous() && identity.getRoles() != null) {
                    String roles =
                            identity.getRoles().stream()
                                    .reduce((a, b) -> a + "," + b)
                                    .orElse("");
                    MDC.put("userRoles", roles);
                }
            }

            // Store query parameters (without values for privacy)
            Map<String, String[]> parameterMap = request.getParameterMap();
            if (parameterMap != null && !parameterMap.isEmpty()) {
                String params = String.join(",", parameterMap.keySet());
                MDC.put("queryParams", params);
            }

            // Continue with the filter chain
            filterChain.doFilter(servletRequest, servletResponse);

        } finally {
            // Clear MDC after request is processed
            MDC.remove("userAgent");
            MDC.remove("referer");
            MDC.remove("acceptLanguage");
            MDC.remove("contentType");
            MDC.remove("userRoles");
            MDC.remove("queryParams");
        }
    }
}
