package stirling.software.saas.accountlink;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** One in-flight "connect this server" handshake. Short lived and single use. */
@Entity
@Table(
        name = "account_link_connect_request",
        indexes = @Index(name = "idx_alcr_ip_created", columnList = "requester_ip,created_at"))
@Getter
@Setter
@NoArgsConstructor
public class ConnectRequest {

    public enum Mode {
        LINK,
        REAUTH
    }

    public enum Status {
        PENDING,
        APPROVED,
        DENIED,
        CONSUMED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "request_id", nullable = false, unique = true, length = 64)
    private String requestId;

    @Column(name = "name", length = 255)
    private String name;

    /**
     * Read back from here on approval, never from the request: that is what stops an open redirect.
     */
    @Column(name = "callback_url", nullable = false, length = 2048)
    private String callbackUrl;

    @Column(name = "callback_origin", nullable = false, length = 255)
    private String callbackOrigin;

    @Column(name = "nonce", nullable = false, length = 128)
    private String nonce;

    /** SHA-256; the secret itself is never stored. */
    @Column(name = "claim_secret_hash", nullable = false, length = 64)
    private String claimSecretHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "mode", nullable = false, length = 16)
    private Mode mode = Mode.LINK;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private Status status = Status.PENDING;

    /** LINK: set on approval. REAUTH: pinned at creation, so approval can only confirm it. */
    @Column(name = "team_id")
    private Long teamId;

    @Column(name = "approved_by_user_id")
    private Long approvedByUserId;

    @Column(name = "requester_ip", length = 45)
    private String requesterIp;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "consumed_at")
    private LocalDateTime consumedAt;

    public boolean isExpired(LocalDateTime now) {
        return expiresAt != null && expiresAt.isBefore(now);
    }
}
