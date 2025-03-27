package stirling.software.SPDF.config;

import org.springframework.beans.factory.annotation.Qualifier;
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
    private boolean loginEnabled = true;

    public EndpointInterceptor(
            EndpointConfiguration endpointConfiguration,
            SessionsInterface sessionsInterface,
            @Qualifier("loginEnabled") boolean loginEnabled) {
        this.endpointConfiguration = endpointConfiguration;
        this.sessionsInterface = sessionsInterface;
        this.loginEnabled = loginEnabled;
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
                    || request.getRequestURI().contains("/session/expire/")
                    || request.getRequestURI().endsWith(".js")
                    || request.getRequestURI().endsWith(".png")
                    || request.getRequestURI().endsWith(".webmanifest")
                    || request.getRequestURI().contains("/files/")) {
                return true;
            } else {
                if (session == null) {
                    session = request.getSession(true);
                }
                final HttpSession finalSession = session;
                String sessionId = finalSession.getId();

                // Den aktuellen Benutzer (principalName) aus der Session ermitteln.
                // Es wird angenommen, dass das Attribut "principalName" in der Session gesetzt
                // wurde.
                final String currentPrincipal =
                        finalSession.getAttribute("principalName") != null
                                ? finalSession.getAttribute("principalName").toString()
                                : "unknown";

                // Zähle alle nicht abgelaufenen Sessions des aktuellen Benutzers.
                long userSessions =
                        sessionsInterface.getAllSessions().stream()
                                .filter(
                                        s ->
                                                !s.isExpired()
                                                        && currentPrincipal.equals(
                                                                s.getPrincipalName()))
                                .count();

                // Zähle alle nicht abgelaufenen Sessions in der Anwendung.
                long totalSessions =
                        sessionsInterface.getAllSessions().stream()
                                .filter(s -> !s.isExpired())
                                .count();

                log.info(
                        "Aktive Sessions für {}: {} (max: {}) | Gesamt: {} (max: {})",
                        currentPrincipal,
                        userSessions,
                        sessionsInterface.getMaxUserSessions(),
                        totalSessions,
                        sessionsInterface.getMaxApplicationSessions());

                // Prüfe die Grenzen:
                // Falls entweder die Benutzersessions oder die Anwendungssessions das Limit
                // erreicht haben
                // und die aktuelle Session noch NICHT registriert ist, dann wird ein Fehler
                // zurückgegeben.
                boolean isCurrentSessionRegistered =
                        sessionsInterface.getAllSessions().stream()
                                .filter(s -> !s.isExpired())
                                .anyMatch(s -> s.getSessionId().equals(sessionId));

                if ((userSessions >= sessionsInterface.getMaxUserSessions()
                                || totalSessions >= sessionsInterface.getMaxApplicationSessions())
                        && !isCurrentSessionRegistered) {
                    response.sendError(
                            HttpServletResponse.SC_UNAUTHORIZED,
                            "Max sessions reached for this user. To continue on this device, please"
                                    + " close your session in another browser.");
                    return false;
                }

                // Wenn die Session noch nicht registriert ist, registriere sie; andernfalls update
                // den Last-Request.
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
        if (!endpointConfiguration.isEndpointEnabled(requestURI)) {
            response.sendError(HttpServletResponse.SC_FORBIDDEN, "This endpoint is disabled");
            return false;
        }
        return true;
    }
}
