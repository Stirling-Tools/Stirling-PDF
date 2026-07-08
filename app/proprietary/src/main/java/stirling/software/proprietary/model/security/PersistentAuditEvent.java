package stirling.software.proprietary.model.security;

import java.time.Instant;

import jakarta.persistence.*;

import lombok.*;

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
                    columnList = "type,timestamp"),
            @jakarta.persistence.Index(
                    name = "idx_audit_type_source_timestamp",
                    columnList = "type,source,timestamp")
        })
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PersistentAuditEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String principal;
    private String type;
    private String source;

    @Column(columnDefinition = "text")
    private String data; // JSON blob

    private Instant timestamp;
}
