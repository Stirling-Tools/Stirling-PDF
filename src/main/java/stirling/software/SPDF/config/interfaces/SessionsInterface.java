package stirling.software.SPDF.config.interfaces;

import java.util.Collection;

import jakarta.servlet.http.HttpSession;

public interface SessionsInterface {

    void updateSessionLastRequest(String sessionId);

    Collection<SessionsModelInterface> getAllSessions();

    Collection<SessionsModelInterface> getAllNonExpiredSessions();

    void registerSession(HttpSession session);

    void removeSession(HttpSession session);

    default int getMaxUserSessions() {
        return 3;
    }

    default int getMaxApplicationSessions() {
        return getMaxUserSessions() * 3;
    }

    default int getMaxUsers() {
        return 10;
    }
}
