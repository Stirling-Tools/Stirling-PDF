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
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One in-flight pairing between a self-hosted instance and a SaaS team (OAuth device authorization
 * grant, RFC 8628).
 *
 * <p>The instance starts a pairing unauthenticated and receives two values: a short {@code
 * user_code} the admin types on our site, and a high-entropy {@code device_code} only the instance
 * ever holds. We store the user code in the clear because it is useless on its own (approving
 * requires an authenticated team leader) but keep only a SHA-256 hash of the device code, which is
 * the real bearer secret.
 *
 * <p>Lifecycle: {@code PENDING} on start, {@code APPROVED} once a leader confirms it, {@code
 * CONSUMED} when the instance polls and collects its device credential. Approval deliberately does
 * not mint the credential; minting happens on the poll that presents the device code, so the secret
 * is only ever delivered to the party that started the pairing. {@code DENIED} is a leader
 * rejecting it. Expiry is by {@code expires_at} rather than a status, so a stale row reads as
 * expired without needing a sweeper.
 */
@Entity
@Table(name = "account_pairing_request")
@Getter
@Setter
@NoArgsConstructor
public class PairingRequest {

    public enum Status {
        PENDING,
        APPROVED,
        CONSUMED,
        DENIED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "pairing_id")
    private Long pairingId;

    /** Normalised (upper case, no separator) code the admin types. Unique while it lives. */
    @Column(name = "user_code", nullable = false, unique = true, length = 16)
    private String userCode;

    /** SHA-256 hex of the device code. The plaintext exists only on the instance. */
    @Column(name = "device_code_hash", nullable = false, length = 64)
    private String deviceCodeHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private Status status = Status.PENDING;

    /** Set on approval; the team the instance will be bound to. */
    @Column(name = "team_id")
    private Long teamId;

    @Column(name = "approved_by_user_id")
    private Long approvedByUserId;

    /**
     * Instance-supplied label, shown on the approval screen so a leader knows what they approve.
     */
    @Column(name = "instance_label", length = 128)
    private String instanceLabel;

    @Column(name = "instance_version", length = 32)
    private String instanceVersion;

    /** Caller address as seen by us, shown on the approval screen and used for rate limiting. */
    @Column(name = "requester_ip", length = 64)
    private String requesterIp;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    /**
     * Last poll, so an instance polling faster than the advertised interval can be told to slow.
     */
    @Column(name = "last_polled_at")
    private LocalDateTime lastPolledAt;

    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "consumed_at")
    private LocalDateTime consumedAt;

    public boolean isExpired(LocalDateTime now) {
        return expiresAt != null && now.isAfter(expiresAt);
    }
}
