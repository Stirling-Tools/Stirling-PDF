package stirling.software.proprietary.security.filter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import io.github.pixee.security.Newlines;
import io.quarkus.security.identity.SecurityIdentity;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.inject.Named;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.model.enumeration.Role;
import stirling.software.common.util.RegexPatternUtils;

// Servlet filter retained (quarkus-undertow). Spring's OncePerRequestFilter replaced by a plain
// jakarta.servlet.Filter registered as a CDI bean via @WebFilter so it covers all requests; the
// rate-limiting logic operates on the raw HttpServletRequest/HttpServletResponse which a JAX-RS
// ContainerRequestFilter does not expose as conveniently.
// TODO: Migration required - Spring's @Profile("!saas") gated this filter so it was NOT registered
// in the "saas" profile. Quarkus has no per-profile bean exclusion on @WebFilter; gate registration
// with @io.quarkus.arc.profile.UnlessBuildProfile("saas") if "saas" is a build profile, or guard
// the
// body with a runtime check on the active profile (org.eclipse.microprofile.config Config /
// io.quarkus.runtime.LaunchMode) if it must be a runtime toggle.
@ApplicationScoped
@WebFilter("/*")
public class UserBasedRateLimitingFilter implements jakarta.servlet.Filter {

    private final Map<String, Bucket> apiBuckets = new ConcurrentHashMap<>();

    private final Map<String, Bucket> webBuckets = new ConcurrentHashMap<>();

    private final boolean rateLimit;

    // TODO: Migration required - SecurityContextHolder replaced by injected SecurityIdentity.
    // SecurityIdentity is request-scoped and is populated by Quarkus security extensions
    // (quarkus-elytron-security / quarkus-oidc / etc.) once authentication is migrated. Until then
    // it will be anonymous and getRoleFromIdentity will fall through to the IllegalStateException.
    private final SecurityIdentity securityIdentity;

    @Inject
    public UserBasedRateLimitingFilter(
            @Named("rateLimit") boolean rateLimit, SecurityIdentity securityIdentity) {
        this.rateLimit = rateLimit;
        this.securityIdentity = securityIdentity;
    }

    @Override
    public void doFilter(
            ServletRequest servletRequest, ServletResponse servletResponse, FilterChain filterChain)
            throws ServletException, IOException {
        HttpServletRequest request = (HttpServletRequest) servletRequest;
        HttpServletResponse response = (HttpServletResponse) servletResponse;
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
        } else if (securityIdentity != null && !securityIdentity.isAnonymous()) {
            identifier = securityIdentity.getPrincipal().getName();
        }
        // If neither API key nor an authenticated user is present, use IP address
        if (identifier == null) {
            identifier = request.getRemoteAddr();
        }
        Role userRole = getRoleFromIdentity(securityIdentity);
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

    private Role getRoleFromIdentity(SecurityIdentity identity) {
        if (identity != null && !identity.isAnonymous()) {
            for (String role : identity.getRoles()) {
                try {
                    return Role.fromString(role);
                } catch (IllegalArgumentException ex) {
                    // Ignore and continue to next role.
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
            response.setStatus(
                    jakarta.ws.rs.core.Response.Status.TOO_MANY_REQUESTS.getStatusCode());
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
        return RegexPatternUtils.getInstance().getNewlineCharsPattern().matcher(s).replaceAll("");
    }
}
