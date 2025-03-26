package stirling.software.SPDF.config;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.interfaces.SessionsInterface;

@Component
@Slf4j
public class EndpointInterceptor implements HandlerInterceptor {

    private final EndpointConfiguration endpointConfiguration;
    private final SessionsInterface sessionsInterface;

    public EndpointInterceptor(
            EndpointConfiguration endpointConfiguration, SessionsInterface sessionsInterface) {
        this.endpointConfiguration = endpointConfiguration;
        this.sessionsInterface = sessionsInterface;
    }

    @Override
    public boolean preHandle(
            HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        HttpSession session = request.getSession(false);
        if (session == null) {
            session = request.getSession(true);
        }

        if ("GET".equalsIgnoreCase(request.getMethod())) {
            if ("/".equals(request.getRequestURI())
                    || "/login".equals(request.getRequestURI())
                    || "/home".equals(request.getRequestURI())
                    || "/home-legacy".equals(request.getRequestURI())
                    || request.getRequestURI().contains("/js/")
                    || request.getRequestURI().contains("/css/")
                    || request.getRequestURI().contains("/fonts/")
                    || request.getRequestURI().contains("/images/")
                    || request.getRequestURI().contains("/favicon")
                    || request.getRequestURI().contains("/error")
                    || request.getRequestURI().contains("/session/status")
                    || request.getRequestURI().contains("/session/expire")
                    || request.getRequestURI().contains("/session/expire-all")
                    || request.getRequestURI().endsWith(".js")
                    || request.getRequestURI().endsWith(".png")
                    || request.getRequestURI().endsWith(".webmanifest")
                    || request.getRequestURI().contains("/files/")) {
                return true;
            } else {
                String sessionId = session != null ? session.getId() : null;

                if (sessionId == null || !sessionsInterface.isSessionValid(sessionId)) {
                    response.sendError(
                            HttpServletResponse.SC_UNAUTHORIZED,
                            "Max sessions reached for this user. To continue on this device, please close your session in another browser.");
                    return false;
                } else {
                    sessionsInterface.updateSessionLastRequest(sessionId);
                }
            }
        }

        String requestURI = request.getRequestURI();
        if (!endpointConfiguration.isEndpointEnabled(requestURI)) {
            response.sendError(HttpServletResponse.SC_FORBIDDEN, "This endpoint is disabled");
            return false;
        }
        return true;
    }
}
