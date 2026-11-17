package stirling.software.proprietary.security.scim;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Locale;

import org.springframework.http.HttpHeaders;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.preauth.PreAuthenticatedAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

/** Authenticates SCIM requests with the configured bearer token and nothing else. */
@Slf4j
public class ScimTokenFilter extends OncePerRequestFilter {

    public static final String AUTHORITY = "ROLE_SCIM";
    static final int MIN_TOKEN_LENGTH = 32;

    // Not a String or UserDetails, so later filters don't look it up as a user account.
    public enum ScimClient {
        SCIM;

        @Override
        public String toString() {
            return "scim-provisioning";
        }
    }

    private final ApplicationProperties.Security security;

    public ScimTokenFilter(ApplicationProperties.Security security) {
        this.security = security;
        String token = security.getScimToken();
        if (token != null && !token.isBlank() && token.length() < MIN_TOKEN_LENGTH) {
            log.warn("security.scimToken is under {} characters; SCIM stays off", MIN_TOKEN_LENGTH);
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // Servlet path is already decoded and normalised by the container.
        return !request.getServletPath().toLowerCase(Locale.ROOT).startsWith("/api/v1/scim/");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String token = security.getScimToken();
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (token == null
                || token.length() < MIN_TOKEN_LENGTH
                || header == null
                || !MessageDigest.isEqual(
                        ("Bearer " + token).getBytes(StandardCharsets.UTF_8),
                        header.getBytes(StandardCharsets.UTF_8))) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/scim+json");
            response.getWriter()
                    .write(
                            "{\"schemas\":[\"urn:ietf:params:scim:api:messages:2.0:Error\"],"
                                    + "\"status\":\"401\",\"detail\":\"Invalid SCIM token\"}");
            return;
        }
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new PreAuthenticatedAuthenticationToken(
                                ScimClient.SCIM,
                                null,
                                List.of(new SimpleGrantedAuthority(AUTHORITY))));
        chain.doFilter(request, response);
    }
}
