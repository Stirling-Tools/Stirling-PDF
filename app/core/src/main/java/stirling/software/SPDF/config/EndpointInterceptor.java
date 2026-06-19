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

@Provider
@RequiredArgsConstructor
public class EndpointInterceptor implements ContainerRequestFilter, ContainerResponseFilter {

    private final EndpointConfiguration endpointConfiguration;

    @Override
    public void filter(ContainerRequestContext requestContext) throws IOException {
        // getUriInfo().getPath() may or may not carry a leading slash depending on the RESTEasy
        // version / root-path. Normalise to exactly one: a stray double slash shifts
        // EndpointConfiguration.endpointKeyForUri()'s segment indexing (parts[4]) to the wrong
        // segment, so a disabled endpoint like "rotate-pdf" resolves as "general" and is never
        // blocked.
        String requestURI = normalizeUri(requestContext.getUriInfo().getPath());

        // Endpoint disabling applies only to the API surface. SPA clean-URL routes (/rotate-pdf,
        // /merge-pdfs, ...) share names with API endpoints but must always resolve to the frontend
        // shell, so never block non-/api paths - otherwise disabling an endpoint also 403s its tool
        // page. (isEndpointEnabledForUri falls back to treating a non-/api URI as an endpoint key.)
        if (!requestURI.startsWith("/api/")) {
            return;
        }

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
        String requestURI = normalizeUri(requestContext.getUriInfo().getPath());
        if (requestURI.startsWith("/api/")) {
            responseContext.getHeaders().putSingle(HttpHeaders.CACHE_CONTROL, "private, no-store");
        }
    }

    private static String normalizeUri(String path) {
        return "/" + (path == null ? "" : path).replaceAll("^/+", "");
    }
}
