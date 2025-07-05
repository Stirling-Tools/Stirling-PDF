package stirling.software.proprietary.model.security;

import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

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

    @Lob private String data; // JSON blob

    private Instant timestamp;
}
