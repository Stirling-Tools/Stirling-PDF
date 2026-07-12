package stirling.software.proprietary.security.model;

import java.io.Serializable;
import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import lombok.Data;

@Entity
@Data
@Table(
        name = "sessions",
        indexes = {
            // per-principal session/activity lookups
            @Index(
                    name = "idx_sessions_principal_last",
                    columnList = "principal_name, last_request"),
            // scheduled expiry/purge scan
            @Index(name = "idx_sessions_expired", columnList = "expired")
        })
public class SessionEntity implements Serializable {
    @Id private String sessionId;

    private String principalName;

    private Instant lastRequest;

    private boolean expired;
}
