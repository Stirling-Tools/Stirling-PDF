package stirling.software.proprietary.security.filter;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;

import io.quarkus.scheduler.Scheduled;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;

import lombok.extern.slf4j.Slf4j;

/** Per-IP rate limiter for the unauthenticated participant token endpoints. */
@Slf4j
@Provider
@ApplicationScoped
public class ParticipantRateLimitInterceptor implements ContainerRequestFilter {

    private static final int MAX_REQUESTS_PER_MINUTE = 20;
    private static final long WINDOW_MS = 60_000L;

    // Replaces the Spring MVC InterceptorRegistry path mapping
    // "/api/v1/workflow/participant/**" (see ProprietaryWebMvcConfig). Since a @Provider
    // ContainerRequestFilter is applied to every request, we self-gate on the path here.
    private static final String PARTICIPANT_PATH_PREFIX = "api/v1/workflow/participant/";

    // value: [requestCount, windowStartMs]
    private final ConcurrentHashMap<String, long[]> requestCounts = new ConcurrentHashMap<>();

    @Override
    public void filter(ContainerRequestContext requestContext) throws IOException {
        String path = requestContext.getUriInfo().getPath();
        if (path == null || !path.contains(PARTICIPANT_PATH_PREFIX)) {
            return;
        }

        String ip = getClientIp(requestContext);
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
            log.warn("Rate limit exceeded for IP {} on participant endpoint {}", ip, path);
            requestContext.abortWith(
                    Response.status(Response.Status.TOO_MANY_REQUESTS)
                            .header("Retry-After", "60")
                            .type("application/json")
                            .entity("{\"error\":\"Rate limit exceeded. Try again in 60 seconds.\"}")
                            .build());
        }
    }

    private String getClientIp(ContainerRequestContext requestContext) {
        // Do not trust X-Forwarded-For: it is user-controlled and trivially spoofed,
        // which would allow an attacker to bypass this rate limiter by rotating fake IPs.
        // Operators who deploy behind a trusted reverse proxy should configure Quarkus'
        // quarkus.http.proxy.* (proxy-address-forwarding / trusted-proxies) at the framework
        // level instead.
        // TODO: Migration required - ContainerRequestContext does not expose the remote
        // address. Inject quarkus' RoutingContext (io.vertx.ext.web.RoutingContext) or
        // jakarta.servlet.http.HttpServletRequest (quarkus-undertow) to obtain
        // request.remoteAddress()/getRemoteAddr(); the previous Spring code used
        // HttpServletRequest.getRemoteAddr(). Falling back to a header-derived key here would
        // reintroduce the spoofing risk documented above.
        Object remoteAddr = requestContext.getProperty("org.eclipse.jetty.server.remoteAddress");
        return remoteAddr != null ? remoteAddr.toString() : "unknown";
    }

    @Scheduled(every = "300s")
    public void cleanupExpiredWindows() {
        long cutoff = System.currentTimeMillis() - WINDOW_MS;
        requestCounts.entrySet().removeIf(e -> e.getValue()[1] < cutoff);
    }
}
