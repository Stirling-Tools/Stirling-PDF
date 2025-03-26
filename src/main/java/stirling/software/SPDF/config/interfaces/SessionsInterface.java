package stirling.software.SPDF.config.interfaces;

import java.util.Collection;

import stirling.software.SPDF.config.anonymus.session.AnonymusSessionInfo;

public interface SessionsInterface {

    default boolean isSessionValid(String sessionId) {
        return false;
    }

    boolean isOldestNonExpiredSession(String sessionId);

    void updateSessionLastRequest(String sessionId);

    Collection<AnonymusSessionInfo> getAllSessions();

    Collection<AnonymusSessionInfo> getAllNonExpiredSessions();
}
