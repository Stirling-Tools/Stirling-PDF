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

        boolean isApiRequest = requestURI.contains("/api/v1");

        if ("GET".equalsIgnoreCase(request.getMethod()) && !isApiRequest) {

            Principal principal = request.getUserPrincipal();

            // allowlist for public or static routes
            if ("/login".equals(requestURI)
                    // || "/".equals(requestURI)
                    // || "/home".equals(requestURI)
                    // || "/home-legacy".equals(requestURI)
                    || "/userSession".equals(requestURI)
                    || requestURI.contains("/userSession/invalidate/")
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

                boolean isExpiredByAdmin =
                        sessionsInterface.getAllSessions().stream()
                                .filter(s -> s.getSessionId().equals(finalSession.getId()))
                                .anyMatch(s -> s.isExpired());

                if (isExpiredByAdmin
                        && !"/".equals(requestURI)
                        && !"/home".equals(requestURI)
                        && !"/home-legacy".equals(requestURI)) {
                    response.sendRedirect("/logout");
                    log.info("Session expired. Logging out user {}", principal.getName());
                    return false;
                } else if (isExpiredByAdmin
                        && ("/".equals(requestURI)
                                || "/home".equals(requestURI)
                                || "/home-legacy".equals(requestURI))) {
                    log.info(
                            "Max sessions reached for this user. To continue on this device, please"
                                    + " close your session in another browser. ");
                    response.sendError(HttpServletResponse.SC_EXPECTATION_FAILED);
                    return false;
                }

                int maxApplicationSessions = sessionsInterface.getMaxApplicationSessions();

                Collection<SessionsModelInterface> allSessions = sessionsInterface.getAllSessions();

                long totalSessionsNonExpired =
                        allSessions.stream().filter(s -> !s.isExpired()).count();

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
                        // activeSessions.stream().anyMatch(s ->
                        // s.getSessionId().equals(sessionId));
                        activeSessions.stream()
                                .anyMatch(
                                        s ->
                                                s.getSessionId().equals(sessionId)
                                                        // && !s.isExpired()
                                                        && s.getPrincipalName()
                                                                .equals(principal.getName()));

                final String currentPrincipal = principal.getName();

                long userSessions =
                        sessionsInterface.getAllSessions().stream()
                                .filter(
                                        s ->
                                                !s.isExpired()
                                                        && currentPrincipal.equals(
                                                                s.getPrincipalName()))
                                .count();

                int maxUserSessions = sessionsInterface.getMaxUserSessions();

                log.info(
                        "Active sessions for {}: {} (max: {}) | Total: {} (max: {}) | Active"
                                + " sessions: {}",
                        currentPrincipal,
                        userSessions,
                        maxUserSessions,
                        totalSessionsNonExpired,
                        maxApplicationSessions,
                        hasUserActiveSession);

                if ((userSessions >= maxUserSessions
                                || totalSessionsNonExpired >= maxApplicationSessions)
                        && !hasUserActiveSession) {
                    log.info(
                            "Max sessions reached for this user. To continue on this device, please"
                                    + " close your session in another browser.");
                    response.sendError(HttpServletResponse.SC_EXPECTATION_FAILED);
                    return false;
                }

                // If session is not registered yet, register it; otherwise, update the last request
                // timestamp.
                if (!hasUserActiveSession) {
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
                    log.info(
                            "Max sessions reached for this user. To continue on this device, please"
                                    + " close your session in another browser.");
                    response.sendError(HttpServletResponse.SC_EXPECTATION_FAILED);
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
