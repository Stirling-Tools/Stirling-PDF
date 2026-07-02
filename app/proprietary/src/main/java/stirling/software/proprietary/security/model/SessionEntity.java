package stirling.software.proprietary.security.model;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

import org.hibernate.proxy.HibernateProxy;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.*;

@Entity
@Getter
@Setter
@ToString
@NoArgsConstructor
@Table(name = "sessions")
public class SessionEntity implements Serializable {
    @Id
    @Setter(AccessLevel.NONE)
    private String sessionId;

    private String principalName;

    private Instant lastRequest;

    private boolean expired;

    public void setSessionId(String sessionId) {
        if (this.sessionId != null && !this.sessionId.equals(sessionId)) {
            throw new IllegalStateException("sessionId is immutable once set");
        }
        this.sessionId = sessionId;
    }

    @Override
    public final boolean equals(Object o) {
        if (this == o) return true;
        if (o == null) return false;
        Class<?> oEffectiveClass =
                o instanceof HibernateProxy
                        ? ((HibernateProxy) o).getHibernateLazyInitializer().getPersistentClass()
                        : o.getClass();
        Class<?> thisEffectiveClass =
                this instanceof HibernateProxy
                        ? ((HibernateProxy) this).getHibernateLazyInitializer().getPersistentClass()
                        : this.getClass();
        if (thisEffectiveClass != oEffectiveClass) return false;
        SessionEntity that = (SessionEntity) o;
        return getSessionId() != null && Objects.equals(getSessionId(), that.getSessionId());
    }

    @Override
    public final int hashCode() {
        return getSessionId() != null ? getSessionId().hashCode() : getClass().hashCode();
    }
}
