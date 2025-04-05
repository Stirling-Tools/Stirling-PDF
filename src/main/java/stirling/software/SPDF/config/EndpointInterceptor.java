package stirling.software.SPDF.config;

import java.security.Principal;
import java.util.Collection;
import java.util.List;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.interfaces.SessionsInterface;
import stirling.software.SPDF.config.interfaces.SessionsModelInterface;

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
        String requestURI = request.getRequestURI();

        if ("GET".equalsIgnoreCase(request.getMethod())) {

            Principal principal = request.getUserPrincipal();

            // allowlist for public or static routes
            if ("/".equals(requestURI)
                    || "/login".equals(requestURI)
                    || "/home".equals(requestURI)
                    || "/home-legacy".equals(requestURI)
                    || requestURI.contains("/js/")
                    || requestURI.contains("/css/")
                    || requestURI.contains("/fonts/")
                    || requestURI.contains("/images/")
                    || requestURI.contains("/favicon")
                    || requestURI.contains("/pdfjs-legacy/")
                    || requestURI.contains("/error")
                    || requestURI.contains("/session")
                    || requestURI.endsWith(".js")
                    || requestURI.endsWith(".png")
                    || requestURI.endsWith(".webmanifest")
                    || requestURI.contains("/files/")) {
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
                    log.debug("Register session: {}", sessionId);
                    sessionsInterface.registerSession(finalSession);
                } else {
                    log.debug("Update session last request: {}", sessionId);
                    sessionsInterface.updateSessionLastRequest(sessionId);
                }
                return true;
            } else if (principal == null) {
                if (session == null) {
                    session = request.getSession(true);
                }
                final HttpSession finalSession = session;
                String sessionId = finalSession.getId();

                int maxApplicationSessions = sessionsInterface.getMaxApplicationSessions();

                Collection<SessionsModelInterface> allSessions = sessionsInterface.getAllSessions();

                long totalSessions = allSessions.stream().filter(s -> !s.isExpired()).count();

                List<SessionsModelInterface> activeSessions =
                        allSessions.stream()
                                .filter(s -> !s.isExpired())
                                .sorted(
                                        (s1, s2) ->
                                                Long.compare(
                                                        s2.getLastRequest().getTime(),
                                                        s1.getLastRequest().getTime()))
                                .limit(maxApplicationSessions)
                                .toList();

                boolean hasUserActiveSession =
                        activeSessions.stream().anyMatch(s -> s.getSessionId().equals(sessionId));

                log.info(
                        "Active sessions for anonymous: Total: {} (max: {}) | Active sessions: {}",
                        totalSessions,
                        maxApplicationSessions,
                        hasUserActiveSession);

                if (totalSessions >= maxApplicationSessions && !hasUserActiveSession) {
                    sessionsInterface.removeSession(finalSession);
                    response.sendError(
                            HttpServletResponse.SC_UNAUTHORIZED,
                            "Max sessions reached for this user. To continue on this device, please"
                                    + " close your session in another browser.");
                    return false;
                }
                if (!hasUserActiveSession) {
                    log.debug("Register session: {}", sessionId);
                    sessionsInterface.registerSession(finalSession);
                } else {
                    log.debug("Update session last request: {}", sessionId);
                    sessionsInterface.updateSessionLastRequest(sessionId);
                }
                return true;
            }
        }

        // Check if endpoint is enabled in config
        if (!endpointConfiguration.isEndpointEnabled(requestURI)) {
            response.sendError(HttpServletResponse.SC_FORBIDDEN, "This endpoint is disabled");
            return false;
        }
        return true;
    }
}
