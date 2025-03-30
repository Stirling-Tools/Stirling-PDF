package stirling.software.SPDF.config;

import java.security.Principal;

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

            Principal principal = request.getUserPrincipal();

            // allowlist for public or static routes
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
                    || request.getRequestURI().contains("/session")
                    || request.getRequestURI().endsWith(".js")
                    || request.getRequestURI().endsWith(".png")
                    || request.getRequestURI().endsWith(".webmanifest")
                    || request.getRequestURI().contains("/files/")) {
                return true;
            } else if (principal != null) {
                if (session == null) {
                    session = request.getSession(true);
                }

                final HttpSession finalSession = session;
                String sessionId = finalSession.getId();

                final String currentPrincipal = principal.getName();

                long userSessions =
                        sessionsInterface.getAllSessions().stream()
                                .filter(
                                        s ->
                                                !s.isExpired()
                                                        && currentPrincipal.equals(
                                                                s.getPrincipalName()))
                                .count();

                long totalSessions =
                        sessionsInterface.getAllSessions().stream()
                                .filter(s -> !s.isExpired())
                                .count();

                int maxUserSessions = sessionsInterface.getMaxUserSessions();

                log.info(
                        "Active sessions for {}: {} (max: {}) | Total: {} (max: {})",
                        currentPrincipal,
                        userSessions,
                        maxUserSessions,
                        totalSessions,
                        sessionsInterface.getMaxApplicationSessions());

                boolean isCurrentSessionRegistered =
                        sessionsInterface.getAllSessions().stream()
                                .filter(s -> !s.isExpired())
                                .anyMatch(s -> s.getSessionId().equals(sessionId));

                if ((userSessions >= maxUserSessions
                                || totalSessions >= sessionsInterface.getMaxApplicationSessions())
                        && !isCurrentSessionRegistered) {
                    response.sendError(
                            HttpServletResponse.SC_UNAUTHORIZED,
                            "Max sessions reached for this user. To continue on this device, please"
                                    + " close your session in another browser.");
                    return false;
                }

                // If session is not registered yet, register it; otherwise, update the last request
                // timestamp.
                if (!isCurrentSessionRegistered) {
                    log.info("Register session: {}", sessionId);
                    sessionsInterface.registerSession(finalSession);
                } else {
                    log.info("Update session last request: {}", sessionId);
                    sessionsInterface.updateSessionLastRequest(sessionId);
                }
                return true;
            } else if (principal == null) {
                if (session == null) {
                    session = request.getSession(true);
                }
                final HttpSession finalSession = session;
                String sessionId = finalSession.getId();

                long totalSessions =
                        sessionsInterface.getAllSessions().stream()
                                .filter(s -> !s.isExpired())
                                .count();
                boolean isCurrentSessionRegistered =
                        sessionsInterface.getAllSessions().stream()
                                .filter(s -> !s.isExpired())
                                .anyMatch(s -> s.getSessionId().equals(sessionId));

                int maxApplicationSessions = sessionsInterface.getMaxApplicationSessions();

                log.info(
                        "Active sessions for anonymous: Total: {} (max: {})",
                        totalSessions,
                        maxApplicationSessions);

                if (totalSessions >= maxApplicationSessions && !isCurrentSessionRegistered) {
                    response.sendError(
                            HttpServletResponse.SC_UNAUTHORIZED,
                            "Max sessions reached for this user. To continue on this device, please"
                                    + " close your session in another browser.");
                    return false;
                }
                if (!isCurrentSessionRegistered) {
                    log.info("Register session: {}", sessionId);
                    sessionsInterface.registerSession(finalSession);
                } else {
                    log.info("Update session last request: {}", sessionId);
                    sessionsInterface.updateSessionLastRequest(sessionId);
                }
                return true;
            }
        }

        String requestURI = request.getRequestURI();
        // Check if endpoint is enabled in config
        if (!endpointConfiguration.isEndpointEnabled(requestURI)) {
            response.sendError(HttpServletResponse.SC_FORBIDDEN, "This endpoint is disabled");
            return false;
        }
        return true;
    }
}
