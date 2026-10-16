package stirling.software.proprietary.security.filter;

import java.io.IOException;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.RateLimitStore;
import stirling.software.common.model.enumeration.Role;

/**
 * Per-role daily POST quota, counted through {@link RateLimitStore} so a cluster enforces one quota
 * across every node. Refill is greedy, per that contract, not all-at-once every 24h.
 */
@Component
@Profile("!saas")
@Slf4j
public class UserBasedRateLimitingFilter extends OncePerRequestFilter {

    private static final Duration DAY = Duration.ofDays(1);

    private final boolean rateLimit;
    private final RateLimitStore rateLimitStore;

    public UserBasedRateLimitingFilter(
            @Qualifier("rateLimit") boolean rateLimit, RateLimitStore rateLimitStore) {
        this.rateLimit = rateLimit;
        this.rateLimitStore = rateLimitStore;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (!rateLimit || !"POST".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        Role userRole = resolveRole(authentication);
        // Permit-all POSTs (login, password reset) carry no role, so there is no quota to charge
        // them against. Brute-force protection on those paths is LoginAttemptService's job.
        if (userRole == null) {
            filterChain.doFilter(request, response);
            return;
        }
        boolean apiCall = request.getHeader("X-API-KEY") != null;
        int limitPerDay = apiCall ? userRole.getApiCallsPerDay() : userRole.getWebCallsPerDay();
        // Unlimited roles are most of the traffic; skip the backplane round trip entirely.
        if (limitPerDay == Integer.MAX_VALUE) {
            filterChain.doFilter(request, response);
            return;
        }
        // Bucket by the resolved user (the auth filter runs first and populates the context, even
        // for X-API-KEY requests), so all of a user's API keys share ONE per-user quota - minting
        // extra keys can't multiply the daily limit.
        String bucketKey = (apiCall ? "api:" : "web:") + authentication.getName();
        processRequest(limitPerDay, bucketKey, request, response, filterChain);
    }

    /** Returns null when the request carries no authenticated principal with a known role. */
    private Role resolveRole(Authentication authentication) {
        if (authentication == null
                || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getName())) {
            return null;
        }
        for (GrantedAuthority authority : authentication.getAuthorities()) {
            try {
                return Role.fromString(authority.getAuthority());
            } catch (IllegalArgumentException ex) {
                // Not a Stirling role (e.g. ROLE_ANONYMOUS, scope authorities); try the next one.
            }
        }
        return null;
    }

    private void processRequest(
            int limitPerDay,
            String bucketKey,
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain)
            throws IOException, ServletException {
        RateLimitStore.RateLimitDecision decision;
        try {
            decision = rateLimitStore.tryConsume(bucketKey, limitPerDay, DAY);
        } catch (RuntimeException ex) {
            // A quota is not a security control: fail open rather than 500 every POST while the
            // backplane is unreachable.
            log.warn("Rate limit store unavailable, allowing request: {}", ex.getMessage());
            filterChain.doFilter(request, response);
            return;
        }
        if (decision.allowed()) {
            response.setHeader("X-Rate-Limit-Remaining", Long.toString(decision.remainingTokens()));
            filterChain.doFilter(request, response);
            return;
        }
        long waitForRefill = decision.nanosToWaitForRefill() / 1_000_000_000;
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setHeader("X-Rate-Limit-Retry-After-Seconds", Long.toString(waitForRefill));
        response.getWriter().write("Rate limit exceeded for POST requests.");
    }
}
