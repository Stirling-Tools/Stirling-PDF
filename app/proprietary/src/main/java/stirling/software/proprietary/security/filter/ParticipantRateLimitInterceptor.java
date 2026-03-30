package stirling.software.proprietary.security.filter;

import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

/** Per-IP rate limiter for the unauthenticated participant token endpoints. */
@Slf4j
@Component
public class ParticipantRateLimitInterceptor implements HandlerInterceptor {

    private static final int MAX_REQUESTS_PER_MINUTE = 20;
    private static final long WINDOW_MS = 60_000L;

    // value: [requestCount, windowStartMs]
    private final ConcurrentHashMap<String, long[]> requestCounts = new ConcurrentHashMap<>();

    @Override
    public boolean preHandle(
            HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {

        String ip = getClientIp(request);
        long now = System.currentTimeMillis();

        long[] entry =
                requestCounts.compute(
                        ip,
                        (key, existing) -> {
                            if (existing == null || now - existing[1] >= WINDOW_MS) {
                                return new long[] {1, now};
                            }
                            existing[0]++;
                            return existing;
                        });

        if (entry[0] > MAX_REQUESTS_PER_MINUTE) {
            log.warn(
                    "Rate limit exceeded for IP {} on participant endpoint {}",
                    ip,
                    request.getRequestURI());
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setHeader("Retry-After", "60");
            response.setContentType("application/json");
            response.getWriter()
                    .write("{\"error\":\"Rate limit exceeded. Try again in 60 seconds.\"}");
            return false;
        }
        return true;
    }

    private String getClientIp(HttpServletRequest request) {
        // Do not trust X-Forwarded-For: it is user-controlled and trivially spoofed,
        // which would allow an attacker to bypass this rate limiter by rotating fake IPs.
        // Operators who deploy behind a trusted reverse proxy should configure Spring's
        // RemoteIpFilter / ForwardedHeaderFilter at the framework level instead.
        return request.getRemoteAddr();
    }

    @Scheduled(fixedDelay = 300_000)
    public void cleanupExpiredWindows() {
        long cutoff = System.currentTimeMillis() - WINDOW_MS;
        requestCounts.entrySet().removeIf(e -> e.getValue()[1] < cutoff);
    }
}
