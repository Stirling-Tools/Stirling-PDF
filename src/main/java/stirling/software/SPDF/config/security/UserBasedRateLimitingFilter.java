package stirling.software.SPDF.config.security;

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

import stirling.software.SPDF.model.Role;

@Component
public class UserBasedRateLimitingFilter extends OncePerRequestFilter {

    private final Map<String, Bucket> apiBuckets = new ConcurrentHashMap<>();

    private final Map<String, Bucket> webBuckets = new ConcurrentHashMap<>();

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
            // If rateLimit is not enabled, just pass all requests without rate limiting
            filterChain.doFilter(request, response);
            return;
        }
        String method = request.getMethod();
        if (!"POST".equalsIgnoreCase(method)) {
            // If the request is not a POST, just pass it through without rate limiting
            filterChain.doFilter(request, response);
            return;
        }
        String identifier = null;
        // Check for API key in the request headers
        String apiKey = request.getHeader("X-API-KEY");
        if (apiKey != null && !apiKey.trim().isEmpty()) {
            identifier = // Prefix to distinguish between API keys and usernames
                    "API_KEY_" + apiKey;
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
            // It's an API call
            processRequest(
                    userRole.getApiCallsPerDay(),
                    identifier,
                    apiBuckets,
                    request,
                    response,
                    filterChain);
        } else {
            // It's a Web UI call
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
            Map<String, Bucket> buckets,
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain)
            throws IOException, ServletException {
        Bucket userBucket = buckets.computeIfAbsent(identifier, k -> createUserBucket(limitPerDay));
        ConsumptionProbe probe = userBucket.tryConsumeAndReturnRemaining(1);
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

    private Bucket createUserBucket(int limitPerDay) {
        Bandwidth limit =
                Bandwidth.builder()
                        .capacity(limitPerDay)
                        .refillIntervally(limitPerDay, Duration.ofDays(1))
                        .build();
        return Bucket.builder().addLimit(limit).build();
    }

    private static String stripNewlines(final String s) {
        return s.replaceAll("[\n\r]", "");
    }
}
