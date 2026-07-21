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
                    columnList = "type,source,timestamp"),
            // Leads with source (equality) for the active-editors query, which filters on
            // source then a timestamp range and counts distinct principal.
            @jakarta.persistence.Index(
                    name = "idx_audit_source_timestamp_principal",
                    columnList = "source,timestamp,principal")
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
