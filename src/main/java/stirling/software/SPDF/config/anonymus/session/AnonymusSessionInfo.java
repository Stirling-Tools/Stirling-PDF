package stirling.software.SPDF.config.anonymus.session;

import java.util.Date;

import jakarta.servlet.http.HttpSession;

import lombok.AccessLevel;
import lombok.Setter;
import lombok.ToString;

import stirling.software.SPDF.config.interfaces.SessionsModelInterface;

@Setter
@ToString(exclude = "session")
public class AnonymusSessionInfo implements SessionsModelInterface {
    private static final String principalName = "anonymousUser";
    private HttpSession session;

    @Setter(AccessLevel.NONE)
    private final Date createdAt;

    private Date lastRequest;
    private Boolean expired;

    public AnonymusSessionInfo(
            HttpSession session, Date createdAt, Date lastRequest, Boolean expired) {
        this.session = session;
        this.createdAt = createdAt;
        this.lastRequest = lastRequest;
        this.expired = expired;
    }

    public HttpSession getSession() {
        return session;
    }

    public Date getCreatedAt() {
        return createdAt;
    }

    @Override
    public Date getLastRequest() {
        return lastRequest;
    }

    @Override
    public boolean isExpired() {
        return expired;
    }

    @Override
    public String getSessionId() {
        return session.getId();
    }

    @Override
    public String getPrincipalName() {
        return principalName;
    }
}
