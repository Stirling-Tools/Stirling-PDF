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
        boolean isEnabled = endpointConfiguration.isEndpointEnabledForUri(requestURI);
        if (!isEnabled) {
            response.sendError(HttpServletResponse.SC_FORBIDDEN, "This endpoint is disabled");
            return false;
        }
        return true;
    }
}
