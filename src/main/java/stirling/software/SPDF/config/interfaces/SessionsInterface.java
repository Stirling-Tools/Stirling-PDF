package stirling.software.SPDF.config.interfaces;

import java.util.Collection;

import jakarta.servlet.http.HttpSession;

public interface SessionsInterface {

    boolean isSessionValid(String sessionId);

    boolean isOldestNonExpiredSession(String sessionId);

    void updateSessionLastRequest(String sessionId);

    Collection<SessionsModelInterface> getAllSessions();

    Collection<SessionsModelInterface> getAllNonExpiredSessions();

    Collection<SessionsModelInterface> getAllNonExpiredSessionsBySessionId(String sessionId);

    void registerSession(HttpSession session);

    void removeSession(HttpSession session);

    default int getMaxUserSessions() {
        return 3;
    }

    default int getMaxApplicationSessions() {
        return 10 * getMaxUserSessions();
    }
}
