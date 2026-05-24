package stirling.software.proprietary.model.security;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.proxy.HibernateProxy;

import java.time.Instant;
import java.util.Objects;

@Entity
@Table(
        name = "audit_events",
        indexes = {
            @jakarta.persistence.Index(name = "idx_audit_timestamp", columnList = "timestamp"),
            @jakarta.persistence.Index(name = "idx_audit_principal", columnList = "principal"),
            @jakarta.persistence.Index(name = "idx_audit_type", columnList = "type"),
            @jakarta.persistence.Index(
                    name = "idx_audit_principal_type",
                    columnList = "principal,type"),
            @jakarta.persistence.Index(
                    name = "idx_audit_type_timestamp",
                    columnList = "type,timestamp")
        })
@Getter
@Setter
@ToString
@RequiredArgsConstructor
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PersistentAuditEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String principal;
    private String type;

    @Column(columnDefinition = "text")
    private String data; // JSON blob

    private Instant timestamp;

    @Override
    public final boolean equals(Object o) {
        if (this == o) return true;
        if (o == null) return false;
        Class<?> oEffectiveClass = o instanceof HibernateProxy ? ((HibernateProxy) o).getHibernateLazyInitializer().getPersistentClass() : o.getClass();
        Class<?> thisEffectiveClass = this instanceof HibernateProxy ? ((HibernateProxy) this).getHibernateLazyInitializer().getPersistentClass() : this.getClass();
        if (thisEffectiveClass != oEffectiveClass) return false;
        PersistentAuditEvent that = (PersistentAuditEvent) o;
        return getId() != null && Objects.equals(getId(), that.getId());
    }

    @Override
    public final int hashCode() {
        return this instanceof HibernateProxy ? ((HibernateProxy) this).getHibernateLazyInitializer().getPersistentClass().hashCode() : getClass().hashCode();
    }
}
