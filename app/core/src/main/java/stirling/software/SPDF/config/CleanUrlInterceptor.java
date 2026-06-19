package stirling.software.SPDF.config;

import java.net.URI;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.ext.Provider;

@Provider
public class CleanUrlInterceptor implements ContainerRequestFilter {

    private static final List<String> ALLOWED_PARAMS =
            Arrays.asList(
                    "lang",
                    "endpoint",
                    "endpoints",
                    "logout",
                    "error",
                    "days",
                    "date",
                    "errorOAuth",
                    "file",
                    "messageType",
                    "infoMessage",
                    "page",
                    "size",
                    "type",
                    "principal",
                    "startDate",
                    "endDate",
                    "async",
                    "session");

    @Override
    public void filter(ContainerRequestContext requestContext) {
        UriInfo uriInfo = requestContext.getUriInfo();
        String requestPath = uriInfo.getPath();

        // Skip URL cleaning for API endpoints - they need their own parameter handling
        if (requestPath.contains("/api/")) {
            return;
        }

        MultivaluedMap<String, String> queryParameters = uriInfo.getQueryParameters();
        if (queryParameters != null && !queryParameters.isEmpty()) {
            // Keep only the allowed parameters (preserve insertion order)
            Map<String, String> allowedParameters = new LinkedHashMap<>();
            for (Map.Entry<String, List<String>> entry : queryParameters.entrySet()) {
                String key = entry.getKey();
                List<String> values = entry.getValue();
                if (values == null || values.size() != 1) {
                    // Mirror the original behaviour which only handled single key=value pairs
                    continue;
                }
                if (ALLOWED_PARAMS.contains(key)) {
                    allowedParameters.put(key, values.get(0));
                }
            }

            // If there are any parameters that are not allowed
            if (allowedParameters.size() != queryParameters.size()) {
                // Construct new query string
                StringBuilder newQueryString = new StringBuilder();
                for (Map.Entry<String, String> entry : allowedParameters.entrySet()) {
                    if (!newQueryString.isEmpty()) {
                        newQueryString.append("&");
                    }
                    newQueryString.append(entry.getKey()).append("=").append(entry.getValue());
                }

                // Redirect to the URL with only allowed query parameters
                URI redirectUri =
                        uriInfo.getBaseUriBuilder()
                                .path(requestPath)
                                .replaceQuery(newQueryString.toString())
                                .build();

                requestContext.abortWith(
                        Response.status(Response.Status.FOUND).location(redirectUri).build());
            }
        }
    }
}
