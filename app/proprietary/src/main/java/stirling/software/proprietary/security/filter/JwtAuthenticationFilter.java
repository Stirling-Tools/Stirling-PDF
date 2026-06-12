package stirling.software.proprietary.security.filter;

import static stirling.software.common.util.RequestUriUtils.isPublicAuthEndpoint;
import static stirling.software.common.util.RequestUriUtils.isStaticResource;
import static stirling.software.proprietary.security.model.AuthenticationType.OAUTH2;
import static stirling.software.proprietary.security.model.AuthenticationType.SAML2;
import static stirling.software.proprietary.security.model.AuthenticationType.WEB;

import java.io.IOException;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.common.security.Authentication;
import stirling.software.common.security.AuthenticationException;
import stirling.software.common.security.GrantedAuthority;
import stirling.software.common.security.SecurityContextHolder;
import stirling.software.common.security.SimpleGrantedAuthority;
import stirling.software.common.security.UsernameNotFoundException;
import stirling.software.common.security.UsernamePasswordAuthenticationToken;
import stirling.software.proprietary.security.JwtAuthenticationEntryPoint;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.exception.AuthenticationFailureException;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.UserService;

// TODO: Migration required - registration/ordering. As a Spring OncePerRequestFilter
// this ran once per request at a Spring-defined position in the security filter chain.
// On Quarkus (quarkus-undertow) a jakarta.servlet.Filter needs explicit registration
// and ordering (e.g. a @WebFilter with urlPatterns, or a FilterRegistrationBean-style
// producer). Confirm this filter is registered ahead of the resource layer and that the
// once-per-request semantics are preserved (Undertow does not re-enter servlet filters
// per forward by default, so the OncePerRequestFilter base is not strictly required).
@Slf4j
@ApplicationScoped
public class JwtAuthenticationFilter implements Filter {

    @Inject JwtServiceInterface jwtService;
    @Inject UserService userService;
    @Inject CustomUserDetailsService userDetailsService;
    // JwtAuthenticationEntryPoint is now a plain CDI bean (it only writes a 401
    // JSON/error to the response); inject the concrete type instead of the former
    // Spring Security AuthenticationEntryPoint interface.
    @Inject JwtAuthenticationEntryPoint authenticationEntryPoint;
    @Inject ApplicationProperties.Security securityProperties;

    @Override
    public void doFilter(
            ServletRequest servletRequest, ServletResponse servletResponse, FilterChain filterChain)
            throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) servletRequest;
        HttpServletResponse response = (HttpServletResponse) servletResponse;

        if (!jwtService.isJwtEnabled()) {
            filterChain.doFilter(request, response);
            return;
        }

        String requestURI = request.getRequestURI();
        String contextPath = request.getContextPath();

        if (isStaticResource(contextPath, requestURI)) {
            filterChain.doFilter(request, response);
            return;
        }

        if (!apiKeyExists(request, response)) {
            String jwtToken = jwtService.extractToken(request);

            // Check if this is a public endpoint BEFORE validating JWT
            // This allows public endpoints to work even with expired tokens in the request
            if (isPublicAuthEndpoint(requestURI, contextPath)) {
                // For public auth endpoints, skip JWT validation and continue
                filterChain.doFilter(request, response);
                return;
            }

            if (jwtToken == null) {
                // No JWT token and not a public endpoint
                // For API requests, return 401 JSON
                String acceptHeader = request.getHeader("Accept");
                if (requestURI.startsWith(contextPath + "/api/")
                        || (acceptHeader != null && acceptHeader.contains("application/json"))) {
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

            try {
                jwtService.validateToken(jwtToken);
            } catch (AuthenticationFailureException e) {
                log.debug("JWT validation failed: {}", e.getMessage());
                handleAuthenticationFailure(request, response, e);
                return;
            }

            Map<String, Object> claims = jwtService.extractClaims(jwtToken);
            String tokenUsername = claims.get("sub").toString();

            try {
                authenticate(request, claims);
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
        // TODO: Migration required - SecurityContextHolder has no Quarkus equivalent.
        // This reads/writes the Spring thread-local security context. On Quarkus, the
        // identity should come from SecurityIdentity (injected) and API-key auth should be
        // handled by a custom IdentityProvider rather than imperatively setting the context.
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

                    // TODO: Migration required - the previous ApiKeyAuthenticationToken
                    // extended Spring Security's AbstractAuthenticationToken. It is now a
                    // plain POJO that does not implement the security-compat Authentication
                    // contract, so it cannot be stored in the SecurityContext. Build a
                    // compat UsernamePasswordAuthenticationToken from the user's authorities
                    // to keep the API-key authentication intent; in Quarkus this should be a
                    // SecurityIdentity produced by a custom IdentityProvider for the API key.
                    List<GrantedAuthority> authorities =
                            user.get().getAuthorities().stream()
                                    .map(
                                            a ->
                                                    (GrantedAuthority)
                                                            new SimpleGrantedAuthority(
                                                                    a.getAuthority()))
                                    .toList();
                    authentication =
                            new UsernamePasswordAuthenticationToken(
                                    user.get(), apiKey, authorities);
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

        // TODO: Migration required - SecurityContextHolder/UsernamePasswordAuthenticationToken.
        // Building a Spring authentication token and pushing it into the thread-local context
        // must be replaced by producing a Quarkus SecurityIdentity (via IdentityProvider/
        // SecurityIdentityAugmentor) from the validated JWT claims. The user-loading logic
        // (userDetailsService.loadUserByUsername) can be kept as a plain service call.
        if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            processUserAuthenticationType(claims, username);
            // loadUserByUsername now returns the User entity directly (the former
            // UserDetailsService/UserDetails Spring contract was dropped during migration).
            User userDetails = userDetailsService.loadUserByUsername(username);

            if (userDetails != null) {
                List<GrantedAuthority> authorities =
                        userDetails.getAuthorities().stream()
                                .map(
                                        a ->
                                                (GrantedAuthority)
                                                        new SimpleGrantedAuthority(
                                                                a.getAuthority()))
                                .toList();
                UsernamePasswordAuthenticationToken authToken =
                        new UsernamePasswordAuthenticationToken(userDetails, null, authorities);

                // TODO: Migration required - Spring's WebAuthenticationDetailsSource
                // (remote address + session id) has no Quarkus equivalent. Storing the
                // request as the details object keeps the call compile-safe; in Quarkus
                // this metadata is available from the RoutingContext / SecurityIdentity.
                authToken.setDetails(request);
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

    // Accepts any Exception so both the application's AuthenticationFailureException
    // (extends RuntimeException) and the security-compat AuthenticationException can be
    // passed through to the entry point, which shapes the 401 response.
    private void handleAuthenticationFailure(
            HttpServletRequest request, HttpServletResponse response, Exception authException)
            throws IOException, ServletException {
        authenticationEntryPoint.commence(request, response, authException);
    }
}
