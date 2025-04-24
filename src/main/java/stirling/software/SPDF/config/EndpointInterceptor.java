package stirling.software.SPDF.config;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
@RequiredArgsConstructor
public class EndpointInterceptor implements HandlerInterceptor {

    private final EndpointConfiguration endpointConfiguration;

    @Override
    public boolean preHandle(
            HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        String requestURI = request.getRequestURI();
        boolean isEnabled;

        // Extract the specific endpoint name (e.g: /api/v1/general/remove-pages -> remove-pages)
        if (requestURI.contains("/api/v1") && requestURI.split("/").length > 4) {

            String[] requestURIParts = requestURI.split("/");
            String requestEndpoint;

            // Endpoint: /api/v1/convert/pdf/img becomes pdf-to-img
            if ("convert".equals(requestURIParts[3]) && requestURIParts.length > 5) {
                requestEndpoint = requestURIParts[4] + "-to-" + requestURIParts[5];
            } else {
                requestEndpoint = requestURIParts[4];
            }

            log.debug("Request endpoint: {}", requestEndpoint);
            isEnabled = endpointConfiguration.isEndpointEnabled(requestEndpoint);
            log.debug("Is endpoint enabled: {}", isEnabled);
        } else {
            isEnabled = endpointConfiguration.isEndpointEnabled(requestURI);
        }

        if (!isEnabled) {
            response.sendError(HttpServletResponse.SC_FORBIDDEN, "This endpoint is disabled");
            return false;
        }
        return true;
    }
}
