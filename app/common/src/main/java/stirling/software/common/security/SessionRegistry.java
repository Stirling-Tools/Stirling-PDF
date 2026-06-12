package stirling.software.common.security;

import java.util.List;

/**
 * Migration compatibility shim for {@code
 * org.springframework.security.core.session.SessionRegistry}.
 *
 * <p>Maintains a registry of currently known principals and their sessions.
 */
public interface SessionRegistry {

    List<Object> getAllPrincipals();

    List<SessionInformation> getAllSessions(Object principal, boolean includeExpiredSessions);

    SessionInformation getSessionInformation(String sessionId);

    void refreshLastRequest(String sessionId);

    void registerNewSession(String sessionId, Object principal);

    void removeSessionInformation(String sessionId);
}
