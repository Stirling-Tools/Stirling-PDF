package stirling.software.SPDF.config;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.ModelAndView;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

public class CleanUrlInterceptor implements HandlerInterceptor {

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
                    "session",
                    "all");

    @Override
    public boolean preHandle(
            HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        String requestURI = request.getRequestURI();

        // Skip URL cleaning for API endpoints - they need their own parameter handling
        if (requestURI.contains("/api/")) {
            return true;
        }

        String queryString = request.getQueryString();
        if (queryString != null && !queryString.isEmpty()) {
            // A null value is a bare flag (?all), which the frontend reads by presence.
            Map<String, String> allowedParameters = new LinkedHashMap<>();
            // The frontend needs state to bind the SaaS response to the initiating browser.
            boolean accountLinkCallback =
                    requestURI.equals(request.getContextPath() + "/account-link/callback");

            // Keep only the allowed parameters
            String[] queryParameters = queryString.split("&");
            for (String param : queryParameters) {
                String[] keyValuePair = param.split("=", -1);
                if (keyValuePair.length > 2 || keyValuePair[0].isEmpty()) {
                    continue;
                }
                String key = keyValuePair[0];
                if (ALLOWED_PARAMS.contains(key) || (accountLinkCallback && "state".equals(key))) {
                    allowedParameters.put(key, keyValuePair.length == 2 ? keyValuePair[1] : null);
                }
            }

            // If there are any parameters that are not allowed
            if (allowedParameters.size() != queryParameters.length) {
                // Construct new query string
                StringBuilder newQueryString = new StringBuilder();
                for (Map.Entry<String, String> entry : allowedParameters.entrySet()) {
                    if (!newQueryString.isEmpty()) {
                        newQueryString.append("&");
                    }
                    newQueryString.append(entry.getKey());
                    if (entry.getValue() != null) {
                        newQueryString.append("=").append(entry.getValue());
                    }
                }

                // Redirect to the URL with only allowed query parameters
                String redirectUrl = requestURI + "?" + newQueryString;

                try {
                    URI redirectUri = new URI(redirectUrl);
                    // Relative URIs can still name another host through a leading //.
                    if (redirectUri.isAbsolute()
                            || redirectUri.getRawAuthority() != null
                            || !redirectUrl.startsWith("/")
                            || redirectUrl.startsWith("//")) {
                        response.sendError(HttpServletResponse.SC_BAD_REQUEST);
                        return false;
                    }
                    response.sendRedirect(redirectUri.toString());
                } catch (URISyntaxException ex) {
                    response.sendError(HttpServletResponse.SC_BAD_REQUEST);
                }
                return false;
            }
        }
        return true;
    }

    @Override
    public void postHandle(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler,
            ModelAndView modelAndView) {}

    @Override
    public void afterCompletion(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler,
            Exception ex) {}
}
