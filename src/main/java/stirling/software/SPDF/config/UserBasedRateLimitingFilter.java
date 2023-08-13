package stirling.software.SPDF.config;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Bucket4j;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.Refill;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
@Component
public class UserBasedRateLimitingFilter extends OncePerRequestFilter {

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Autowired
    private UserDetailsService userDetailsService;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

    String method = request.getMethod();
    
    if (!"POST".equalsIgnoreCase(method)) {
        // If the request is not a POST, just pass it through without rate limiting
        filterChain.doFilter(request, response);
        return;
    }

    String identifier;
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    
    if (authentication != null && authentication.isAuthenticated()) {
        UserDetails userDetails = (UserDetails) authentication.getPrincipal();
        identifier = userDetails.getUsername();
    } else {
        identifier = request.getRemoteAddr(); // Use IP as identifier if not authenticated
    }

    Bucket userBucket = buckets.computeIfAbsent(identifier, k -> createUserBucket());
    ConsumptionProbe probe = userBucket.tryConsumeAndReturnRemaining(1);
    
    if (probe.isConsumed()) {
        response.setHeader("X-Rate-Limit-Remaining", Long.toString(probe.getRemainingTokens()));
        filterChain.doFilter(request, response);
    } else {
        long waitForRefill = probe.getNanosToWaitForRefill() / 1_000_000_000;
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setHeader("X-Rate-Limit-Retry-After-Seconds", String.valueOf(waitForRefill));
        response.getWriter().write("Rate limit exceeded for POST requests.");
        return;
    }
}

private Bucket createUserBucket() {
    Bandwidth limit = Bandwidth.classic(1000, Refill.intervally(1000, Duration.ofDays(1)));
    return Bucket.builder().addLimit(limit).build();
}

}


