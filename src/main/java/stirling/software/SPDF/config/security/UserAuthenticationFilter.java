package stirling.software.SPDF.config.security;

import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URL;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
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
import jakarta.servlet.http.HttpServletResponseWrapper;
import stirling.software.SPDF.model.ApiKeyAuthenticationToken;

@Component
public class UserAuthenticationFilter extends OncePerRequestFilter {

    @Autowired private UserDetailsService userDetailsService;

    @Autowired @Lazy private UserService userService;

    @Autowired
    @Qualifier("loginEnabled")
    public boolean loginEnabledValue;

    @Value("${redirect.port:}") // Default to empty if not set
    private String redirectPort;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        // Custom response wrapper to modify the redirect location
        HttpServletResponseWrapper responseWrapper =
                new HttpServletResponseWrapper(response) {
                    @Override
                    public void sendRedirect(String location) throws IOException {
                        // Modify the location to include the correct port
                        String modifiedLocation = modifyLocation(location, request);
                        super.sendRedirect(modifiedLocation);
                    }
                };

        if (!loginEnabledValue) {
            // If login is not enabled, just pass all requests without authentication
            filterChain.doFilter(request, responseWrapper);
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
                        responseWrapper.setStatus(HttpStatus.UNAUTHORIZED.value());
                        responseWrapper.getWriter().write("Invalid API Key.");
                        return;
                    }
                    authentication =
                            new ApiKeyAuthenticationToken(
                                    userDetails, apiKey, userDetails.getAuthorities());
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                } catch (AuthenticationException e) {
                    // If API key authentication fails, deny the request
                    responseWrapper.setStatus(HttpStatus.UNAUTHORIZED.value());
                    responseWrapper.getWriter().write("Invalid API Key.");
                    return;
                }
            }
        }

        // If we still don't have any authentication, deny the request
        if (authentication == null || !authentication.isAuthenticated()) {
            String method = request.getMethod();
            String contextPath = request.getContextPath();

            if ("GET".equalsIgnoreCase(method) && !(contextPath + "/login").equals(requestURI)) {
                responseWrapper.sendRedirect(contextPath + "/login"); // redirect to the login page
                return;
            } else {
                responseWrapper.setStatus(HttpStatus.UNAUTHORIZED.value());
                responseWrapper
                        .getWriter()
                        .write(
                                "Authentication required. Please provide a X-API-KEY in request header.\nThis is found in Settings -> Account Settings -> API Key\nAlternativly you can disable authentication if this is unexpected");
                return;
            }
        }

        filterChain.doFilter(request, responseWrapper);
    }

    private String modifyLocation(String location, HttpServletRequest request) {
        if (!location.matches("https?://[^/]+:\\d+.*")
                && redirectPort != null
                && redirectPort.length() > 0) {
            try {
                int port = Integer.parseInt(redirectPort); // Parse the port
                URL url = new URL(location);
                String modifiedUrl =
                        new URL(url.getProtocol(), url.getHost(), port, url.getFile()).toString();
                return modifiedUrl;
            } catch (MalformedURLException | NumberFormatException e) {
                // Log error and return the original location if URL parsing fails
                e.printStackTrace();
            }
        }
        return location;
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
            contextPath + "/js/",
            contextPath + "/pdfjs/",
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
