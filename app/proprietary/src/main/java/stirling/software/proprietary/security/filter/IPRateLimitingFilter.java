package stirling.software.proprietary.security.filter;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.RequestUriUtils;

@Slf4j
public class IPRateLimitingFilter implements Filter {

    private final ConcurrentHashMap<String, AtomicInteger> requestCounts =
            new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, AtomicInteger> getCounts = new ConcurrentHashMap<>();
    private final int maxRequests;
    private final int maxGetRequests;
    private final Runnable onFirstUse;
    private final AtomicBoolean firstUseSignalled = new AtomicBoolean();

    /** Construction without a first-use callback. */
    public IPRateLimitingFilter(int maxRequests, int maxGetRequests) {
        this(maxRequests, maxGetRequests, () -> {});
    }

    /**
     * @param onFirstUse runs at most once, on the first non-static request; a callback that fails
     *     is retried by the next request
     */
    public IPRateLimitingFilter(int maxRequests, int maxGetRequests, Runnable onFirstUse) {
        this.maxRequests = maxRequests;
        this.maxGetRequests = maxGetRequests;
        this.onFirstUse = onFirstUse;
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (request instanceof HttpServletRequest httpServletRequest) {
            HttpServletRequest httpRequest = httpServletRequest;
            String method = httpRequest.getMethod();
            String requestURI = httpRequest.getRequestURI();
            // Check if the request is for static resources
            boolean isStaticResource =
                    RequestUriUtils.isStaticResource(httpRequest.getContextPath(), requestURI);

            // If it's a static resource, just continue the filter chain and skip the logic below
            if (isStaticResource) {
                chain.doFilter(request, response);
                return;
            }

            signalFirstUse();

            String clientIp = request.getRemoteAddr();
            requestCounts.computeIfAbsent(clientIp, k -> new AtomicInteger(0));
            if (!"GET".equalsIgnoreCase(method)) {

                if (requestCounts.get(clientIp).incrementAndGet() > maxRequests) {
                    // Handle limit exceeded (e.g., send error response)
                    response.getWriter().write("Rate limit exceeded");
                    return;
                }
            } else {
                if (requestCounts.get(clientIp).incrementAndGet() > maxGetRequests) {
                    // Handle limit exceeded (e.g., send error response)
                    response.getWriter().write("GET Rate limit exceeded");
                    return;
                }
            }
        }
        chain.doFilter(request, response);
    }

    private void signalFirstUse() {
        if (firstUseSignalled.get()) {
            return;
        }
        try {
            onFirstUse.run();
            firstUseSignalled.set(true);
        } catch (RuntimeException e) {
            log.warn("First-use callback failed; a later request will retry", e);
        }
    }

    public void resetRequestCounts() {
        requestCounts.clear();
        getCounts.clear();
    }
}
