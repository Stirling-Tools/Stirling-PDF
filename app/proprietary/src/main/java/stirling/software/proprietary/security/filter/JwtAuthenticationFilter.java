package stirling.software.proprietary.security.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.sql.SQLException;
import java.util.Map;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.web.filter.OncePerRequestFilter;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.exception.AuthenticationFailureException;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.UserService;
import static stirling.software.common.util.RequestUriUtils.isStaticResource;
import static stirling.software.proprietary.security.model.AuthenticationType.OAUTH2;
import static stirling.software.proprietary.security.model.AuthenticationType.SAML2;
import static stirling.software.proprietary.security.model.AuthenticationType.WEB;

@Slf4j
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtServiceInterface jwtService;
    private final UserService userService;
    private final CustomUserDetailsService userDetailsService;
    private final AuthenticationEntryPoint authenticationEntryPoint;
    private final ApplicationProperties.Security securityProperties;

    public JwtAuthenticationFilter(
            JwtServiceInterface jwtService,
            UserService userService,
            CustomUserDetailsService userDetailsService,
            AuthenticationEntryPoint authenticationEntryPoint,
            ApplicationProperties.Security securityProperties) {
        this.jwtService = jwtService;
        this.userService = userService;
        this.userDetailsService = userDetailsService;
        this.authenticationEntryPoint = authenticationEntryPoint;
        this.securityProperties = securityProperties;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (!jwtService.isJwtEnabled()) {
            filterChain.doFilter(request, response);
            return;
        }
        if (isStaticResource(request.getContextPath(), request.getRequestURI())) {
            filterChain.doFilter(request, response);
            return;
        }

        if (!apiKeyExists(request, response)) {
            String jwtToken = jwtService.extractToken(request);

            if (jwtToken == null) {
                // Allow specific auth endpoints to pass through without JWT
                String requestURI = request.getRequestURI();
                String contextPath = request.getContextPath();

                // Public auth endpoints that don't require JWT
                boolean isPublicAuthEndpoint =
                        requestURI.startsWith(contextPath + "/login")
                                || requestURI.startsWith(contextPath + "/signup")
                                || requestURI.startsWith(contextPath + "/auth/")
                                || requestURI.startsWith(contextPath + "/oauth2")
                                || requestURI.startsWith(contextPath + "/api/v1/auth/login")
                                || requestURI.startsWith(contextPath + "/api/v1/auth/register")
                                || requestURI.startsWith(contextPath + "/api/v1/auth/refresh");

                if (!isPublicAuthEndpoint) {
                    // For API requests, return 401 JSON
                    String acceptHeader = request.getHeader("Accept");
                    if (requestURI.startsWith(contextPath + "/api/")
                            || (acceptHeader != null
                                    && acceptHeader.contains("application/json"))) {
                        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                        response.setContentType("application/json");
                        response.getWriter().write("{\"error\":\"Authentication required\"}");
                        return;
                    }

                    // For HTML requests (SPA routes), let React Router handle it (serve
                    // index.html)
                    filterChain.doFilter(request, response);
                    return;
                }

                // For public auth endpoints without JWT, continue to the endpoint
                filterChain.doFilter(request, response);
                return;
            }

            try {
                log.debug("Validating JWT token");
                jwtService.validateToken(jwtToken);
                log.debug("JWT token validated successfully");
            } catch (AuthenticationFailureException e) {
                log.warn("JWT validation failed: {}", e.getMessage());
                handleAuthenticationFailure(request, response, e);
                return;
            }

            Map<String, Object> claims = jwtService.extractClaims(jwtToken);
            String tokenUsername = claims.get("sub").toString();
            log.debug("JWT token username: {}", tokenUsername);

            try {
                authenticate(request, claims);
                log.debug("Authentication successful for user: {}", tokenUsername);
            } catch (SQLException | UnsupportedProviderException e) {
                log.error("Error processing user authentication for user: {}", tokenUsername, e);
                handleAuthenticationFailure(
                        request,
                        response,
                        new AuthenticationFailureException(
                                "Error processing user authentication", e));
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private boolean apiKeyExists(HttpServletRequest request, HttpServletResponse response)
            throws IOException, ServletException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !authentication.isAuthenticated()) {
            String apiKey = request.getHeader("X-API-KEY");

            if (apiKey != null && !apiKey.isBlank()) {
                try {
                    Optional<User> user = userService.getUserByApiKey(apiKey);

                    if (user.isEmpty()) {
                        handleAuthenticationFailure(
                                request,
                                response,
                                new AuthenticationFailureException("Invalid API Key"));
                        return false;
                    }

                    authentication =
                            new ApiKeyAuthenticationToken(
                                    user.get(), apiKey, user.get().getAuthorities());
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                    return true;
                } catch (AuthenticationException e) {
                    handleAuthenticationFailure(
                            request,
                            response,
                            new AuthenticationFailureException("Invalid API Key", e));
                    return false;
                }
            }

            return false;
        }

        return true;
    }

    private void authenticate(HttpServletRequest request, Map<String, Object> claims)
            throws SQLException, UnsupportedProviderException {
        String username = claims.get("sub").toString();

        if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            processUserAuthenticationType(claims, username);
            UserDetails userDetails = userDetailsService.loadUserByUsername(username);

            if (userDetails != null) {
                UsernamePasswordAuthenticationToken authToken =
                        new UsernamePasswordAuthenticationToken(
                                userDetails, null, userDetails.getAuthorities());

                authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authToken);
            } else {
                throw new UsernameNotFoundException("User not found: " + username);
            }
        }
    }

    private void processUserAuthenticationType(Map<String, Object> claims, String username)
            throws SQLException, UnsupportedProviderException {
        AuthenticationType authenticationType =
                AuthenticationType.valueOf(
                        claims.getOrDefault("authType", WEB).toString().toUpperCase());
        log.debug("Processing {} login for {} user", authenticationType, username);

        switch (authenticationType) {
            case OAUTH2 -> {
                ApplicationProperties.Security.OAUTH2 oauth2Properties =
                        securityProperties.getOauth2();
                // Provider IDs should already be set during initial authentication
                // Pass null here since this is validating an existing JWT token
                userService.processSSOPostLogin(
                        username, null, null, oauth2Properties.getAutoCreateUser(), OAUTH2);
            }
            case SAML2 -> {
                ApplicationProperties.Security.SAML2 saml2Properties =
                        securityProperties.getSaml2();
                // Provider IDs should already be set during initial authentication
                // Pass null here since this is validating an existing JWT token
                userService.processSSOPostLogin(
                        username, null, null, saml2Properties.getAutoCreateUser(), SAML2);
            }
        }
    }

    private void handleAuthenticationFailure(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authException)
            throws IOException, ServletException {
        authenticationEntryPoint.commence(request, response, authException);
    }
}
