package stirling.software.SPDF.config.anonymus.session;

import java.util.Date;

import jakarta.servlet.http.HttpSession;

public class AnonymusSessionInfo {
    private HttpSession session;
    private final Date createdAt;
    private Date lastRequest;
    private Boolean expired;

    public AnonymusSessionInfo(
            HttpSession session, Date createdAt, Date lastRequest, Boolean expired) {
        this.session = session;
        this.createdAt = createdAt;
        this.expired = expired;
        this.lastRequest = lastRequest;
    }

    public void setSession(HttpSession session) {
        this.session = session;
    }

    public HttpSession getSession() {
        return session;
    }

    public Date getCreatedAt() {
        return createdAt;
    }

    public void setExpired(Boolean expired) {
        this.expired = expired;
    }

    public Boolean isExpired() {
        return expired;
    }

    public void setLastRequest(Date lastRequest) {
        this.lastRequest = lastRequest;
    }

    public Date getLastRequest() {
        return lastRequest;
    }
}
