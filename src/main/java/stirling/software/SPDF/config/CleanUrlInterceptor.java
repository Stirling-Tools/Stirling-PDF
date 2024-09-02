package stirling.software.SPDF.config;

import java.util.Arrays;
import java.util.HashMap;
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
                    "erroroauth",
                    "file",
                    "messageType",
                    "infoMessage");

    @Override
    public boolean preHandle(
            HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        String queryString = request.getQueryString();
        if (queryString != null && !queryString.isEmpty()) {
            String requestURI = request.getRequestURI();
            Map<String, String> allowedParameters = new HashMap<>();

            // Keep only the allowed parameters
            String[] queryParameters = queryString.split("&");
            for (String param : queryParameters) {
                String[] keyValuePair = param.split("=");
                if (keyValuePair.length != 2) {
                    continue;
                }
                if (ALLOWED_PARAMS.contains(keyValuePair[0])) {
                    allowedParameters.put(keyValuePair[0], keyValuePair[1]);
                }
            }

            // If there are any parameters that are not allowed
            if (allowedParameters.size() != queryParameters.length) {
                // Construct new query string
                StringBuilder newQueryString = new StringBuilder();
                for (Map.Entry<String, String> entry : allowedParameters.entrySet()) {
                    if (newQueryString.length() > 0) {
                        newQueryString.append("&");
                    }
                    newQueryString.append(entry.getKey()).append("=").append(entry.getValue());
                }

                // Redirect to the URL with only allowed query parameters
                String redirectUrl = requestURI + "?" + newQueryString;

                response.sendRedirect(request.getContextPath() + redirectUrl);
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
