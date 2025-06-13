package stirling.software.proprietary.model.security;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "audit_events")
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class PersistentAuditEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String principal;
    private String type;

    @Lob
    private String data;          // JSON blob

    private Instant timestamp;
}