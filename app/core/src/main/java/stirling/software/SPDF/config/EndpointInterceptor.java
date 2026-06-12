package stirling.software.SPDF.config;

import java.io.IOException;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Provider
@Slf4j
@RequiredArgsConstructor
public class EndpointInterceptor implements ContainerRequestFilter, ContainerResponseFilter {

    private final EndpointConfiguration endpointConfiguration;

    @Override
    public void filter(ContainerRequestContext requestContext) throws IOException {
        // In JAX-RS the matched path is relative to the application base (no leading servlet
        // context). getPath() returns the path without a leading slash, so normalise it back to
        // the absolute-style URI the EndpointConfiguration expects.
        String requestURI = "/" + requestContext.getUriInfo().getPath();

        boolean isEnabled = endpointConfiguration.isEndpointEnabledForUri(requestURI);
        if (!isEnabled) {
            requestContext.abortWith(
                    Response.status(Response.Status.FORBIDDEN)
                            .entity("This endpoint is disabled")
                            .build());
        }
    }

    @Override
    public void filter(
            ContainerRequestContext requestContext, ContainerResponseContext responseContext)
            throws IOException {
        // Prevent API responses from being stored by browsers or intermediary caches by default.
        // In Spring this was keyed off request.getServletPath(); here we use the matched JAX-RS
        // path. The application is served under /api/ so check the request path prefix.
        String requestURI = "/" + requestContext.getUriInfo().getPath();
        if (requestURI.startsWith("/api/")) {
            responseContext.getHeaders().putSingle(HttpHeaders.CACHE_CONTROL, "private, no-store");
        }
    }
}
