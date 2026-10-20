package stirling.software.proprietary.mcp.security;

import java.io.IOException;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.proprietary.mcp.McpAnalytics;

/** Applies deployment-specific account policy before a validated MCP JWT can reach any tool. */
public class McpUserBindingFilter extends OncePerRequestFilter {
    private final McpAuthenticationPolicy policy;

    public McpUserBindingFilter(McpAuthenticationPolicy policy) {
        this.policy = policy;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        Authentication current = SecurityContextHolder.getContext().getAuthentication();
        if (current instanceof JwtAuthenticationToken jwtAuth && jwtAuth.isAuthenticated()) {
            try {
                Authentication bound = policy.bindJwt(jwtAuth);
                SecurityContext context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(bound);
                SecurityContextHolder.setContext(context);
                request.setAttribute(McpAnalytics.AUTH_METHOD_ATTRIBUTE, "oauth");
            } catch (AccessDeniedException denied) {
                McpAccessDeniedResponse.write(response, denied);
                return;
            }
        }
        filterChain.doFilter(request, response);
    }
}
