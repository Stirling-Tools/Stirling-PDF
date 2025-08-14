package stirling.software.proprietary.security.matcher;

import java.lang.reflect.Method;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerExecutionChain;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.AutoJobPostMapping;

/**
 * Shared matcher component to determine if a request should be subject to anonymous API access and
 * credit limiting. This ensures consistent behavior between UserAuthenticationFilter and
 * ApiCreditFilter.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ApiJobEndpointMatcher {

    private final RequestMappingHandlerMapping handlerMapping;

    @Value("${api.credit-system.exclude-settings:true}")
    private boolean excludeSettings;

    @Value("${api.credit-system.exclude-actuator:true}")
    private boolean excludeActuator;

    /**
     * Determines if a request matches the criteria for API job endpoints that should be
     * credit-limited and allowed for anonymous access.
     *
     * @param request the HTTP request to check
     * @return true if the request is a POST to an @AutoJobPostMapping endpoint
     */
    public boolean matches(HttpServletRequest request) {
        // Only POST requests are considered
        if (!"POST".equalsIgnoreCase(request.getMethod())) {
            return false;
        }

        String path = request.getRequestURI();

        // Apply exclusion rules
        if (excludeActuator && path != null && path.startsWith("/actuator")) {
            return false;
        }

        if (excludeSettings && isSettingsEndpoint(path)) {
            return false;
        }

        // Check if the handler method has @AutoJobPostMapping annotation
        return hasAutoJobPostMapping(request);
    }

    private boolean hasAutoJobPostMapping(HttpServletRequest request) {
        try {
            HandlerExecutionChain chain = handlerMapping.getHandler(request);
            if (chain == null) {
                return false;
            }

            Object handler = chain.getHandler();
            if (!(handler instanceof HandlerMethod handlerMethod)) {
                return false;
            }

            Method method = handlerMethod.getMethod();
            return method.isAnnotationPresent(AutoJobPostMapping.class);

        } catch (Exception e) {
            log.trace(
                    "Could not resolve handler for {}: {}",
                    request.getRequestURI(),
                    e.getMessage());
            return false;
        }
    }

    private boolean isSettingsEndpoint(String path) {
        return path != null
                && (path.contains("/settings")
                        || path.contains("/update-enable-analytics")
                        || path.contains("/config")
                        || path.contains("/preferences"));
    }
}
