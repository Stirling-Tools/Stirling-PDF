package stirling.software.SPDF.config.security;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import stirling.software.SPDF.model.ApiKeyAuthenticationToken;

@Component
public class UserAuthenticationFilter extends OncePerRequestFilter {

    @Autowired private UserDetailsService userDetailsService;

    @Autowired @Lazy private UserService userService;

    @Autowired
    @Qualifier("loginEnabled")
    public boolean loginEnabledValue;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        if (!loginEnabledValue) {
            // If login is not enabled, just pass all requests without authentication
            filterChain.doFilter(request, response);
            return;
        }
        String requestURI = request.getRequestURI();
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        // Check for API key in the request headers if no authentication exists
        if (authentication == null || !authentication.isAuthenticated()) {
            String apiKey = request.getHeader("X-API-Key");
            if (apiKey != null && !apiKey.trim().isEmpty()) {
                try {
                    // Use API key to authenticate. This requires you to have an authentication
                    // provider for API keys.
                    UserDetails userDetails = userService.loadUserByApiKey(apiKey);
                    if (userDetails == null) {
                        response.setStatus(HttpStatus.UNAUTHORIZED.value());
                        response.getWriter().write("Invalid API Key.");
                        return;
                    }
                    authentication =
                            new ApiKeyAuthenticationToken(
                                    userDetails, apiKey, userDetails.getAuthorities());
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                } catch (AuthenticationException e) {
                    // If API key authentication fails, deny the request
                    response.setStatus(HttpStatus.UNAUTHORIZED.value());
                    response.getWriter().write("Invalid API Key.");
                    return;
                }
            }
        }

        // If we still don't have any authentication, deny the request
        if (authentication == null || !authentication.isAuthenticated()) {
            String method = request.getMethod();
            String contextPath = request.getContextPath();

            if ("GET".equalsIgnoreCase(method) && !(contextPath + "/login").equals(requestURI)) {
                response.sendRedirect(contextPath + "/login"); // redirect to the login page
                return;
            } else {
                response.setStatus(HttpStatus.UNAUTHORIZED.value());
                response.getWriter()
                        .write(
                                "Authentication required. Please provide a X-API-KEY in request header.\nThis is found in Settings -> Account Settings -> API Key\nAlternatively you can disable authentication if this is unexpected");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) throws ServletException {
        String uri = request.getRequestURI();
        String contextPath = request.getContextPath();
        String[] permitAllPatterns = {
            contextPath + "/login",
            contextPath + "/register",
            contextPath + "/error",
            contextPath + "/images/",
            contextPath + "/public/",
            contextPath + "/css/",
            contextPath + "/fonts/",
            contextPath + "/js/",
            contextPath + "/pdfjs/",
            contextPath + "/pdfjs-legacy/",
            contextPath + "/api/v1/info/status",
            contextPath + "/site.webmanifest"
        };

        for (String pattern : permitAllPatterns) {
            if (uri.startsWith(pattern) || uri.endsWith(".svg")) {
                return true;
            }
        }

        return false;
    }
}
