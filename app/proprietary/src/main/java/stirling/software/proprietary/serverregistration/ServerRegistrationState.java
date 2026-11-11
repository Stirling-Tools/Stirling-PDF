package stirling.software.proprietary.serverregistration;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import lombok.Getter;
import lombok.Setter;

/**
 * Local singleton. The secret stays outside Team device storage and must survive lost cloud
 * replies.
 */
@Entity
@Table(name = "server_registration_state")
@Getter
@Setter
public class ServerRegistrationState {
    @Id private Long id = 1L;

    @Version
    @Column(nullable = false, columnDefinition = "bigint not null default 0")
    private Long version;

    @Column(nullable = false)
    private UUID installationId;

    @Column(nullable = false, length = 43)
    private String registrationSecret;

    @Column(nullable = false, length = 64)
    private String proofHash;

    private UUID registrationId;

    @Enumerated(EnumType.STRING)
    private ServerRegistrationProtocol.PurchaseMapping purchaseMapping;

    @Column(nullable = false)
    private long reportSequence;

    private Instant lastSuccessAt;
}
