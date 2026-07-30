package stirling.software.proprietary.security.filter;

import java.io.IOException;

import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Stamps the authenticated principal into MDC for every request. Async job workers resolve the
 * caller via UserService's MDC fallback; without this the fallback only worked when the audit
 * aspect (a pro feature) happened to populate it.
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class PrincipalMdcFilter extends OncePerRequestFilter {

    static final String MDC_KEY = "auditPrincipal";

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String previous = MDC.get(MDC_KEY);
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        boolean stamped = false;
        if (previous == null
                && authentication != null
                && authentication.isAuthenticated()
                && !"anonymousUser".equals(authentication.getPrincipal())) {
            MDC.put(MDC_KEY, authentication.getName());
            stamped = true;
        }
        try {
            filterChain.doFilter(request, response);
        } finally {
            if (stamped) {
                MDC.remove(MDC_KEY);
            }
        }
    }
}
