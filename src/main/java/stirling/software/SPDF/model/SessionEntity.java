package stirling.software.SPDF.model;

import java.io.Serializable;
import java.util.Date;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Data;

import stirling.software.SPDF.config.interfaces.SessionsModelInterface;

@Entity
@Data
@Table(name = "sessions")
public class SessionEntity implements Serializable, SessionsModelInterface {
    @Id private String sessionId;
    private String principalName;
    private Date lastRequest;
    private boolean expired;

    @Override
    public String getSessionId() {
        return sessionId;
    }

    @Override
    public String getPrincipalName() {
        return principalName;
    }

    @Override
    public Date getLastRequest() {
        return lastRequest;
    }

    @Override
    public boolean isExpired() {
        return expired;
    }
}
