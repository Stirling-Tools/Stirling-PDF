package stirling.software.proprietary.security.filter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import io.github.pixee.security.Newlines;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.model.enumeration.Role;
import stirling.software.common.util.RegexPatternUtils;

@Component
public class UserBasedRateLimitingFilter extends OncePerRequestFilter {

    private final Map<String, RateLimitedBucket> apiBuckets = new ConcurrentHashMap<>();

    private final Map<String, RateLimitedBucket> webBuckets = new ConcurrentHashMap<>();

    @Qualifier("rateLimit")
    private final boolean rateLimit;

    public UserBasedRateLimitingFilter(@Qualifier("rateLimit") boolean rateLimit) {
        this.rateLimit = rateLimit;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (!rateLimit) {
            filterChain.doFilter(request, response);
            return;
        }
        String method = request.getMethod();
        if (!"POST".equalsIgnoreCase(method)) {
            filterChain.doFilter(request, response);
            return;
        }
        String identifier = null;
        // Check for API key in the request headers
        String apiKey = request.getHeader("X-API-KEY");
        if (apiKey != null && !apiKey.trim().isEmpty()) {
            identifier = "API_KEY_" + apiKey;
        } else {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication != null && authentication.isAuthenticated()) {
                UserDetails userDetails = (UserDetails) authentication.getPrincipal();
                identifier = userDetails.getUsername();
            }
        }
        // If neither API key nor an authenticated user is present, use IP address
        if (identifier == null) {
            identifier = request.getRemoteAddr();
        }
        Role userRole =
                getRoleFromAuthentication(SecurityContextHolder.getContext().getAuthentication());
        if (request.getHeader("X-API-KEY") != null) {
            processRequest(
                    userRole.getApiCallsPerDay(),
                    identifier,
                    apiBuckets,
                    request,
                    response,
                    filterChain);
        } else {
            processRequest(
                    userRole.getWebCallsPerDay(),
                    identifier,
                    webBuckets,
                    request,
                    response,
                    filterChain);
        }
    }

    private Role getRoleFromAuthentication(Authentication authentication) {
        if (authentication != null && authentication.isAuthenticated()) {
            for (GrantedAuthority authority : authentication.getAuthorities()) {
                try {
                    return Role.fromString(authority.getAuthority());
                } catch (IllegalArgumentException ex) {
                    // Ignore and continue to next authority.
                }
            }
        }
        throw new IllegalStateException("User does not have a valid role.");
    }

    private void processRequest(
            int limitPerDay,
            String identifier,
            Map<String, RateLimitedBucket> buckets,
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain)
            throws IOException, ServletException {
        // If user's plan changed (upgrade/downgrade), recreate the bucket with new limits
        RateLimitedBucket existing = buckets.get(identifier);
        if (existing != null && existing.limitPerDay() != limitPerDay) {
            buckets.remove(identifier);
        }
        RateLimitedBucket rateLimitedBucket =
                buckets.computeIfAbsent(identifier, k -> createRateLimitedBucket(limitPerDay));

        // Unlimited plans bypass rate limiting entirely
        if (rateLimitedBucket.limitPerDay() == Integer.MAX_VALUE) {
            response.setHeader("X-Rate-Limit-Remaining", "unlimited");
            filterChain.doFilter(request, response);
            return;
        }

        ConsumptionProbe probe = rateLimitedBucket.bucket().tryConsumeAndReturnRemaining(1);
        if (probe.isConsumed()) {
            response.setHeader(
                    "X-Rate-Limit-Remaining",
                    stripNewlines(Newlines.stripAll(Long.toString(probe.getRemainingTokens()))));
            filterChain.doFilter(request, response);
        } else {
            long waitForRefill = probe.getNanosToWaitForRefill() / 1_000_000_000;
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setHeader(
                    "X-Rate-Limit-Retry-After-Seconds",
                    Newlines.stripAll(String.valueOf(waitForRefill)));
            response.getWriter().write("Rate limit exceeded for POST requests.");
        }
    }

    private RateLimitedBucket createRateLimitedBucket(int limitPerDay) {
        Bandwidth limit =
                Bandwidth.builder()
                        .capacity(limitPerDay)
                        .refillIntervally(limitPerDay, Duration.ofDays(1))
                        .build();
        Bucket bucket = Bucket.builder().addLimit(limit).build();
        return new RateLimitedBucket(bucket, limitPerDay);
    }

    /**
     * Clears all cached rate-limit buckets, forcing them to be recreated on the next request.
     * Useful when plan assignments change in bulk (e.g., via admin action).
     */
    public void resetAllBuckets() {
        apiBuckets.clear();
        webBuckets.clear();
    }

    private static String stripNewlines(final String s) {
        return RegexPatternUtils.getInstance().getNewlineCharsPattern().matcher(s).replaceAll("");
    }

    /** Pairs a Bucket4j bucket with the rate limit it was created with. */
    private record RateLimitedBucket(Bucket bucket, int limitPerDay) {}
}
