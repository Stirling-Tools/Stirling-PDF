package stirling.software.proprietary.security.filter;

import java.io.IOException;
import java.lang.reflect.Method;
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
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerExecutionChain;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.proprietary.model.CreditRequestContext;
import stirling.software.proprietary.security.matcher.ApiJobEndpointMatcher;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.ApiCreditService;
import stirling.software.proprietary.service.CreditContextManager;

@Component
@Order(1)
@RequiredArgsConstructor
@Slf4j
public class ApiCreditFilter extends OncePerRequestFilter {

    private final ApiCreditService creditService;
    private final UserService userService;
    private final ApiJobEndpointMatcher apiJobEndpointMatcher;
    private final RequestMappingHandlerMapping handlerMapping;
    private final ObjectMapper objectMapper;
    private final CreditContextManager contextManager;

    @Value("${api.credit-system.enabled:true}")
    private boolean creditSystemEnabled;

    @Value("${api.credit-system.anonymous.enabled:true}")
    private boolean anonymousCreditSystemEnabled;

    @Value("${api.credit-system.default-credit-cost:1}")
    private int defaultCreditCost;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        if (!shouldApplyCreditSystem(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            // Determine credit cost from annotation
            int creditCost = getCreditCostForEndpoint(request);

            User user = getCurrentUser();
            String ipAddress = getClientIpAddress(request);
            String userAgent = request.getHeader("User-Agent");

            // Create request context for tracking
            String requestId = CreditRequestContext.generateRequestId();
            CreditRequestContext context =
                    new CreditRequestContext(
                            requestId,
                            user,
                            ipAddress,
                            userAgent,
                            creditCost,
                            request.getRequestURI());
            contextManager.setContext(context);

            ApiCreditService.CreditStatus status;

            if (user == null) {
                // Handle anonymous users with same pre-check approach as authenticated users
                if (!anonymousCreditSystemEnabled) {
                    filterChain.doFilter(request, response);
                    return;
                }

                status = creditService.preCheckAnonymousCredits(ipAddress, userAgent, creditCost);
                context.setCreditsPreChecked(true);

                addCreditHeaders(response, status);

                if (!status.allowed()) {
                    handleAnonymousCreditExceeded(response, status);
                    return;
                }
            } else {
                // Handle authenticated users with pre-check approach
                status = creditService.preCheckCredits(user, creditCost);
                context.setCreditsPreChecked(true);

                addCreditHeaders(response, status);

                if (!status.allowed()) {
                    handleCreditExceeded(response, user, status);
                    return;
                }
            }

            filterChain.doFilter(request, response);

        } finally {
            // Always clear context at end of request
            contextManager.clearContext();
        }
    }

    private boolean shouldApplyCreditSystem(HttpServletRequest request) {
        if (!creditSystemEnabled) {
            return false;
        }

        // Use the shared matcher to determine if this endpoint should be credit-limited
        return apiJobEndpointMatcher.matches(request);
    }

    private int getCreditCostForEndpoint(HttpServletRequest request) {
        try {
            HandlerExecutionChain chain = handlerMapping.getHandler(request);
            if (chain == null) {
                return defaultCreditCost;
            }

            Object handler = chain.getHandler();
            if (!(handler instanceof HandlerMethod handlerMethod)) {
                return defaultCreditCost;
            }

            Method method = handlerMethod.getMethod();
            AutoJobPostMapping annotation = method.getAnnotation(AutoJobPostMapping.class);
            if (annotation == null) {
                return defaultCreditCost;
            }

            // Use resourceWeight as credit cost, with minimum of 1 and maximum of 100
            return Math.max(1, Math.min(100, annotation.resourceWeight()));

        } catch (Exception e) {
            log.debug(
                    "Could not determine credit cost for {}: {}",
                    request.getRequestURI(),
                    e.getMessage());
            return defaultCreditCost;
        }
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

    private void addCreditHeaders(
            HttpServletResponse response, ApiCreditService.CreditStatus status) {
        // Calculate window length (seconds in current month)
        YearMonth currentMonth = YearMonth.now(ZoneOffset.UTC);
        YearMonth nextMonth = currentMonth.plusMonths(1);
        ZonedDateTime startOfMonth = currentMonth.atDay(1).atStartOfDay(ZoneOffset.UTC);
        ZonedDateTime startOfNextMonth = nextMonth.atDay(1).atStartOfDay(ZoneOffset.UTC);
        long windowSeconds = java.time.Duration.between(startOfMonth, startOfNextMonth).getSeconds();

        // Use standard RateLimit headers (IETF draft-ietf-httpapi-ratelimit-headers) adapted for
        // credits
        response.setHeader("RateLimit-Limit", String.valueOf(status.monthlyCredits()));
        response.setHeader("RateLimit-Remaining", String.valueOf(status.remaining()));
        response.setHeader(
                "RateLimit-Reset",
                String.valueOf(getSecondsUntilReset())); // Delta seconds to reset
        response.setHeader(
                "RateLimit-Policy",
                String.format(
                        "%d;w=%d;comment=\"%s\"",
                        status.monthlyCredits(), windowSeconds, status.scope()));
        response.setHeader("X-Credits-Used-This-Month", String.valueOf(status.creditsConsumed()));

        // Add Retry-After for 429 responses
        if (!status.allowed()) {
            response.setHeader("Retry-After", String.valueOf(getSecondsUntilReset()));
        }
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

    private void handleCreditExceeded(
            HttpServletResponse response, User user, ApiCreditService.CreditStatus status)
            throws IOException {
        log.warn("Credit limit exceeded for user: {} - {}", user.getUsername(), status.reason());

        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);

        var errorResponse =
                new CreditErrorResponse(
                        "Credit limit exceeded",
                        status.reason(),
                        status.creditsConsumed(),
                        status.monthlyCredits(),
                        status.remaining(),
                        status.scope(),
                        getNextMonthResetEpochMillis());

        response.getWriter().write(objectMapper.writeValueAsString(errorResponse));
    }

    private record CreditErrorResponse(
            String error,
            String message,
            int creditsConsumed,
            int monthlyCredits,
            int creditsRemaining,
            String scope,
            long resetEpochMillis) {}

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

    private void handleAnonymousCreditExceeded(
            HttpServletResponse response, ApiCreditService.CreditStatus status) throws IOException {
        log.warn("Anonymous credit limit exceeded - {}", status.reason());

        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);

        var errorResponse =
                new CreditErrorResponse(
                        "Credit limit exceeded",
                        status.reason() + " - Please login for higher limits",
                        status.creditsConsumed(),
                        status.monthlyCredits(),
                        status.remaining(),
                        status.scope(),
                        getNextMonthResetEpochMillis());

        response.getWriter().write(objectMapper.writeValueAsString(errorResponse));
    }
}
