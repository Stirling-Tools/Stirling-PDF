package stirling.software.proprietary.security.filter;

import java.io.IOException;
import java.time.Duration;

import org.apache.commons.codec.digest.DigestUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import io.github.pixee.security.Newlines;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.cluster.RateLimitStore;
import stirling.software.common.cluster.RateLimitStore.RateLimitDecision;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.proprietary.cluster.ClusterMetrics;

@Component
@Profile("!saas")
public class UserBasedRateLimitingFilter extends OncePerRequestFilter {

    private final RateLimitStore rateLimitStore;

    @Qualifier("rateLimit")
    private final boolean rateLimit;

    @Autowired(required = false)
    private ClusterMetrics clusterMetrics;

    public UserBasedRateLimitingFilter(
            @Qualifier("rateLimit") boolean rateLimit, RateLimitStore rateLimitStore) {
        this.rateLimit = rateLimit;
        this.rateLimitStore = rateLimitStore;
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
        String identifier;
        String apiKey = request.getHeader("X-API-KEY");
        if (apiKey != null && !apiKey.trim().isEmpty()) {
            // Hash the API key so the raw value never appears in any Valkey rate-limit bucket key.
            identifier = "API_KEY_" + DigestUtils.sha256Hex(apiKey);
        } else {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            // AnonymousAuthenticationToken.isAuthenticated() == true but principal is
            // "anonymousUser";
            // guard the cast so anonymous requests fall through to the remote-addr branch.
            if (authentication != null
                    && authentication.isAuthenticated()
                    && authentication.getPrincipal() instanceof UserDetails userDetails) {
                identifier = userDetails.getUsername();
            } else {
                identifier = request.getRemoteAddr();
            }
        }
        Role userRole =
                getRoleFromAuthentication(SecurityContextHolder.getContext().getAuthentication());
        String scope;
        int limitPerDay;
        if (request.getHeader("X-API-KEY") != null) {
            scope = "api:";
            limitPerDay = userRole.getApiCallsPerDay();
        } else {
            scope = "web:";
            limitPerDay = userRole.getWebCallsPerDay();
        }
        processRequest(limitPerDay, scope + identifier, request, response, filterChain);
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
        return Role.WEB_ONLY_USER; // no matching authority - use most restrictive bucket
    }

    private void processRequest(
            int limitPerDay,
            String bucketKey,
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain)
            throws IOException, ServletException {
        RateLimitDecision probe =
                rateLimitStore.tryConsume(bucketKey, limitPerDay, Duration.ofDays(1));
        if (probe.allowed()) {
            response.setHeader(
                    "X-Rate-Limit-Remaining",
                    stripNewlines(Newlines.stripAll(Long.toString(probe.remainingTokens()))));
            filterChain.doFilter(request, response);
        } else {
            long waitForRefill = probe.nanosToWaitForRefill() / 1_000_000_000;
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setHeader(
                    "X-Rate-Limit-Retry-After-Seconds",
                    Newlines.stripAll(String.valueOf(waitForRefill)));
            response.getWriter().write("Rate limit exceeded for POST requests.");
            if (clusterMetrics != null) {
                clusterMetrics.recordRateLimitReject();
            }
        }
    }

    private static String stripNewlines(final String s) {
        return RegexPatternUtils.getInstance().getNewlineCharsPattern().matcher(s).replaceAll("");
    }
}
