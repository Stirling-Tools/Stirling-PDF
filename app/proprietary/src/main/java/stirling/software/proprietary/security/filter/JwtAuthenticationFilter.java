package stirling.software.proprietary.security.filter;

import static stirling.software.common.util.RequestUriUtils.isStaticResource;
import static stirling.software.proprietary.security.model.AuthenticationType.*;
import static stirling.software.proprietary.security.model.AuthenticationType.SAML2;

import java.io.IOException;
import java.sql.SQLException;
import java.util.Map;
import java.util.Optional;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.exception.AuthenticationFailureException;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.UserService;

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
        if (!validateAndNormalizeJwtSettings() && !jwtService.isJwtEnabled()) {
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
                // Any unauthenticated requests should redirect to /login
                String requestURI = request.getRequestURI();
                String contextPath = request.getContextPath();

                if (!requestURI.startsWith(contextPath + "/login")) {
                    response.sendRedirect("/login");
                    return;
                }
            }

            try {
                jwtService.validateToken(jwtToken);
            } catch (AuthenticationFailureException e) {
                jwtService.clearToken(response);
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

    private boolean validateAndNormalizeJwtSettings() {
        ApplicationProperties.Security.Jwt jwtProperties = securityProperties.getJwt();

        boolean enableKeystore = jwtProperties.isEnableKeystore();
        boolean enableKeyRotation = jwtProperties.isEnableKeyRotation();
        boolean enableKeyCleanup = jwtProperties.isEnableKeyCleanup();
        boolean secureCookie = jwtProperties.isSecureCookie();

        // If any JWT property is disabled, disable all JWT properties for consistency
        if (!enableKeystore || !enableKeyRotation || !enableKeyCleanup || !secureCookie) {
            log.debug(
                    "One or more JWT properties are disabled - normalizing all JWT settings to false");
            log.debug(
                    "Current settings: keystore={}, rotation={}, cleanup={}, secureCookie={}",
                    enableKeystore,
                    enableKeyRotation,
                    enableKeyCleanup,
                    secureCookie);

            jwtProperties.setEnableKeystore(false);
            jwtProperties.setEnableKeyRotation(false);
            jwtProperties.setEnableKeyCleanup(false);
            jwtProperties.setSecureCookie(false);

            return false;
        }

        return true;
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
                AuthenticationType.valueOf(claims.getOrDefault("authType", WEB).toString());
        log.debug("Processing {} login for {} user", authenticationType, username);

        switch (authenticationType) {
            case OAUTH2 -> {
                ApplicationProperties.Security.OAUTH2 oauth2Properties =
                        securityProperties.getOauth2();
                userService.processSSOPostLogin(
                        username, oauth2Properties.getAutoCreateUser(), OAUTH2);
            }
            case SAML2 -> {
                ApplicationProperties.Security.SAML2 saml2Properties =
                        securityProperties.getSaml2();
                userService.processSSOPostLogin(
                        username, saml2Properties.getAutoCreateUser(), SAML2);
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
