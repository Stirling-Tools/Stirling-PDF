package stirling.software.proprietary.security.filter;

import java.io.IOException;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.matcher.ApiJobEndpointMatcher;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.ApiRateLimitService;

@Component
@Order(1)
@RequiredArgsConstructor
@Slf4j
public class ApiRateLimitFilter extends OncePerRequestFilter {

    private final ApiRateLimitService rateLimitService;
    private final UserService userService;
    private final ApiJobEndpointMatcher apiJobEndpointMatcher;
    private final ObjectMapper objectMapper;
    
    @Value("${api.rate-limit.enabled:true}")
    private boolean rateLimitEnabled;
    
    @Value("${api.rate-limit.anonymous.enabled:true}")
    private boolean anonymousRateLimitEnabled;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, 
                                  FilterChain filterChain) throws ServletException, IOException {
        
        if (!shouldApplyRateLimit(request)) {
            filterChain.doFilter(request, response);
            return;
        }
        
        User user = getCurrentUser();
        ApiRateLimitService.RateLimitStatus status;
        
        if (user == null) {
            // Handle anonymous users
            if (!anonymousRateLimitEnabled) {
                filterChain.doFilter(request, response);
                return;
            }
            
            String ipAddress = getClientIpAddress(request);
            String userAgent = request.getHeader("User-Agent");
            
            status = rateLimitService.checkAndIncrementAnonymousUsage(ipAddress, userAgent);
            
            addRateLimitHeaders(response, status);
            
            if (!status.allowed()) {
                handleAnonymousRateLimitExceeded(response, status);
                return;
            }
        } else {
            // Handle authenticated users
            status = rateLimitService.checkAndIncrementUsage(user);
            
            addRateLimitHeaders(response, status);
            
            if (!status.allowed()) {
                handleRateLimitExceeded(response, user, status);
                return;
            }
        }
        
        filterChain.doFilter(request, response);
    }
    
    private boolean shouldApplyRateLimit(HttpServletRequest request) {
        if (!rateLimitEnabled) {
            return false;
        }
        
        // Use the shared matcher to determine if this endpoint should be rate-limited
        return apiJobEndpointMatcher.matches(request);
    }
    
    // TODO: improve with Redis and async in future V2.1
    private User getCurrentUser() {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication == null || !authentication.isAuthenticated()) {
                return null;
            }
            
            String username = authentication.getName();
            if ("anonymousUser".equals(username)) {
                return null;
            }
            
            return userService.findByUsername(username).orElse(null);
        } catch (Exception e) {
            log.error("Error getting user for rate limiting: {}", e.getMessage());
            return null;
        }
    }
    
    private void addRateLimitHeaders(HttpServletResponse response, ApiRateLimitService.RateLimitStatus status) {
        // Use standard RateLimit headers (IETF draft-ietf-httpapi-ratelimit-headers)
        response.setHeader("RateLimit-Limit", String.valueOf(status.monthlyLimit()));
        response.setHeader("RateLimit-Remaining", String.valueOf(status.remaining()));
        response.setHeader("RateLimit-Reset", String.valueOf(getNextMonthResetEpochMillis() / 1000)); // Unix timestamp in seconds
        response.setHeader("RateLimit-Policy", String.format("%d;w=%d;comment=\"%s\"", 
            status.monthlyLimit(), getSecondsUntilReset(), status.scope()));
    }
    
    private long getNextMonthResetEpochMillis() {
        YearMonth currentMonth = YearMonth.now(ZoneOffset.UTC);
        YearMonth nextMonth = currentMonth.plusMonths(1);
        ZonedDateTime resetTime = nextMonth.atDay(1).atStartOfDay(ZoneOffset.UTC);
        return resetTime.toInstant().toEpochMilli();
    }
    
    private long getSecondsUntilReset() {
        return (getNextMonthResetEpochMillis() - System.currentTimeMillis()) / 1000;
    }
    
    private void handleRateLimitExceeded(HttpServletResponse response, User user, 
                                        ApiRateLimitService.RateLimitStatus status) throws IOException {
        log.warn("Rate limit exceeded for user: {} - {}", user.getUsername(), status.reason());
        
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        
        var errorResponse = new RateLimitErrorResponse(
            "Rate limit exceeded",
            status.reason(),
            status.currentUsage(),
            status.monthlyLimit(),
            status.scope(),
            getNextMonthResetEpochMillis()
        );
        
        response.getWriter().write(objectMapper.writeValueAsString(errorResponse));
    }
    
    private record RateLimitErrorResponse(
        String error,
        String message,
        int currentUsage,
        int monthlyLimit,
        String scope,
        long resetEpochMillis
    ) {}
    
    private String getClientIpAddress(HttpServletRequest request) {
        // Check for proxy headers
        String[] headers = {
            "X-Forwarded-For",
            "X-Real-IP",
            "Proxy-Client-IP",
            "WL-Proxy-Client-IP",
            "HTTP_X_FORWARDED_FOR",
            "HTTP_X_FORWARDED",
            "HTTP_X_CLUSTER_CLIENT_IP",
            "HTTP_CLIENT_IP",
            "HTTP_FORWARDED_FOR",
            "HTTP_FORWARDED",
            "HTTP_VIA",
            "REMOTE_ADDR"
        };
        
        for (String header : headers) {
            String ip = request.getHeader(header);
            if (ip != null && !ip.isEmpty() && !"unknown".equalsIgnoreCase(ip)) {
                // Handle comma-separated IPs (in case of multiple proxies)
                int commaIndex = ip.indexOf(',');
                if (commaIndex > 0) {
                    ip = ip.substring(0, commaIndex).trim();
                }
                return ip;
            }
        }
        
        // Fallback to remote address
        return request.getRemoteAddr();
    }
    
    private void handleAnonymousRateLimitExceeded(HttpServletResponse response, 
                                                 ApiRateLimitService.RateLimitStatus status) throws IOException {
        log.warn("Anonymous rate limit exceeded - {}", status.reason());
        
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        
        var errorResponse = new RateLimitErrorResponse(
            "Rate limit exceeded",
            status.reason() + " - Please login for higher limits",
            status.currentUsage(),
            status.monthlyLimit(),
            status.scope(),
            getNextMonthResetEpochMillis()
        );
        
        response.getWriter().write(objectMapper.writeValueAsString(errorResponse));
    }
}