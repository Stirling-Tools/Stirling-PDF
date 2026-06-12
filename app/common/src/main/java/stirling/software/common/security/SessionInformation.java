package stirling.software.common.security;

import java.util.Date;

/**
 * Migration compatibility shim for
 * {@code org.springframework.security.core.session.SessionInformation}.
 *
 * <p>Represents a record of a session within the application's session registry.
 */
public class SessionInformation {

    private final Object principal;
    private final String sessionId;
    private Date lastRequest;
    private boolean expired = false;

    public SessionInformation(Object principal, String sessionId, Date lastRequest) {
        this.principal = principal;
        this.sessionId = sessionId;
        this.lastRequest = lastRequest;
    }

    public Object getPrincipal() {
        return principal;
    }

    public String getSessionId() {
        return sessionId;
    }

    public Date getLastRequest() {
        return lastRequest;
    }

    public boolean isExpired() {
        return expired;
    }

    public void expireNow() {
        this.expired = true;
    }

    public void refreshLastRequest() {
        this.lastRequest = new Date();
    }
}
