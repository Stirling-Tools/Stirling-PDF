package stirling.software.SPDF.config.security.session;

import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.logout.LogoutHandler;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@AllArgsConstructor
public class PreLogoutDataCaptureHandler implements LogoutHandler {

    private final SessionPersistentRegistry sessionPersistentRegistry;

    @Override
    public void logout(
            HttpServletRequest request,
            HttpServletResponse response,
            Authentication authentication) {

        HttpSession session = request.getSession(false);
        if (session == null) {
            return;
        }

        String sessionId = session.getId();
        if (sessionId == null) {
            return;
        }

        String path = request.getServletPath();
        if (path == null) {
            return;
        }

        // Only handle explicit logout requests
        if (!"/logout".equals(path)) {
            return;
        }

        log.debug("Session ID: {} Principal: {}", sessionId, authentication.getPrincipal());

        // Mark the session as expired and remove its record
        sessionPersistentRegistry.expireSession(sessionId);
        sessionPersistentRegistry.removeSessionInformation(sessionId);
    }
}
