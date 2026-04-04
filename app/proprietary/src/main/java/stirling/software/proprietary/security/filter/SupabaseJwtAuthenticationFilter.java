package stirling.software.proprietary.security.filter;

import static stirling.software.common.util.RequestUriUtils.isPublicAuthEndpoint;
import static stirling.software.common.util.RequestUriUtils.isStaticResource;

import java.io.IOException;
import java.util.HashSet;
import java.util.Optional;

import javax.crypto.SecretKey;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.web.filter.OncePerRequestFilter;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.UserService;

/**
 * Authentication filter that validates Supabase-issued JWTs. When a valid Supabase JWT is present,
 * this filter auto-provisions a local User record (if needed) and sets up the Spring Security
 * context so downstream filters and controllers see an authenticated principal.
 *
 * <p>This filter runs <b>before</b> the existing {@link JwtAuthenticationFilter} so that Supabase
 * tokens are handled first; the existing filter then skips requests that are already authenticated.
 */
@Slf4j
public class SupabaseJwtAuthenticationFilter extends OncePerRequestFilter {

    private final SecretKey signingKey;
    private final UserService userService;
    private final CustomUserDetailsService userDetailsService;

    public SupabaseJwtAuthenticationFilter(
            String supabaseJwtSecret,
            UserService userService,
            CustomUserDetailsService userDetailsService) {
        this.signingKey = Keys.hmacShaKeyFor(supabaseJwtSecret.getBytes());
        this.userService = userService;
        this.userDetailsService = userDetailsService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String requestURI = request.getRequestURI();
        String contextPath = request.getContextPath();

        // Skip static resources and public endpoints
        if (isStaticResource(contextPath, requestURI)
                || isPublicAuthEndpoint(requestURI, contextPath)) {
            filterChain.doFilter(request, response);
            return;
        }

        // Skip if already authenticated (e.g., via API key)
        if (SecurityContextHolder.getContext().getAuthentication() != null
                && SecurityContextHolder.getContext().getAuthentication().isAuthenticated()) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = extractBearerToken(request);
        if (token == null) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            Claims claims =
                    Jwts.parser()
                            .verifyWith(signingKey)
                            .build()
                            .parseSignedClaims(token)
                            .getPayload();

            String supabaseId = claims.getSubject();
            String email = (String) claims.get("email");
            String role = (String) claims.get("role");

            if (supabaseId == null) {
                filterChain.doFilter(request, response);
                return;
            }

            // Skip anonymous Supabase tokens
            if ("anon".equals(role)) {
                filterChain.doFilter(request, response);
                return;
            }

            // Auto-provision or look up the local user
            User localUser = findOrCreateUser(supabaseId, email);

            UserDetails userDetails =
                    userDetailsService.loadUserByUsername(localUser.getUsername());
            UsernamePasswordAuthenticationToken authToken =
                    new UsernamePasswordAuthenticationToken(
                            userDetails, null, userDetails.getAuthorities());
            authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(authToken);

        } catch (Exception e) {
            // Not a valid Supabase JWT — let the next filter try
            log.debug("Supabase JWT validation failed, passing to next filter: {}", e.getMessage());
        }

        filterChain.doFilter(request, response);
    }

    private String extractBearerToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }

    /**
     * Finds an existing user by their Supabase ID, or creates a new one. Uses the supabaseId field
     * on the User entity to match.
     */
    private User findOrCreateUser(String supabaseId, String email) {
        Optional<User> existingUser = userService.findBySupabaseId(supabaseId);
        if (existingUser.isPresent()) {
            return existingUser.get();
        }

        // Auto-provision a new user with FREE_USER role
        String username = email != null ? email : "supabase_" + supabaseId;

        // Check if a user with this username already exists (edge case: email collision)
        try {
            Optional<User> byUsername = userService.findByUsernameIgnoreCase(username);
            if (byUsername.isPresent()) {
                User existing = byUsername.get();
                // Link the supabase ID to this existing user
                existing.setSupabaseId(supabaseId);
                if (email != null) {
                    existing.setEmail(email);
                }
                return userService.saveUser(existing);
            }
        } catch (Exception e) {
            log.debug("No existing user found for username {}: {}", username, e.getMessage());
        }

        // Create a brand-new user
        User newUser = new User();
        newUser.setUsername(username);
        newUser.setSupabaseId(supabaseId);
        newUser.setEmail(email);
        newUser.setEnabled(true);
        newUser.setAuthenticationType(AuthenticationType.OAUTH2);
        newUser.setPlanTier("free");

        Authority authority = new Authority(Role.FREE_USER.getRoleId(), newUser);
        newUser.setAuthorities(new HashSet<>());
        newUser.addAuthority(authority);

        return userService.saveUser(newUser);
    }
}
