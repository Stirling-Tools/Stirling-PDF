package stirling.software.saas.accountlink;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One self-hosted instance that has linked a SaaS account (combined-billing "Mode A", {@code
 * linked_instance}, V22).
 *
 * <p>Created by {@code POST /api/v1/account-link/register}, authenticated with the admin's
 * short-lived Supabase JWT. Registration mints a {@code device_id} (public) plus a {@code
 * device_secret} (high-entropy, returned once and stored only on the instance — we keep an unsalted
 * SHA-256 hash, the same posture as API keys). The instance authenticates its unattended
 * entitlement reads with that device credential, so no long-lived user JWT lives on the server
 * side.
 *
 * <p>{@code revoked_at IS NULL} means active; revoking sets it and the credential stops
 * authenticating. The whole surface is gated behind {@code stirling.billing.account-link.enabled}.
 */
@Entity
@Table(name = "linked_instance")
@Getter
@Setter
@NoArgsConstructor
public class LinkedInstance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "instance_id")
    private Long instanceId;

    @Column(name = "team_id", nullable = false)
    private Long teamId;

    /**
     * Admin who registered the instance; informational (no FK, so a user delete never offlines it).
     */
    @Column(name = "created_by_user_id")
    private Long createdByUserId;

    /** Public, non-secret identifier the instance presents on every request. */
    @Column(name = "device_id", nullable = false, unique = true, length = 64)
    private String deviceId;

    /** SHA-256 hex of the device secret; the secret itself is never stored. */
    @Column(name = "device_secret_hash", nullable = false, length = 64)
    private String deviceSecretHash;

    /** Operator-set display label (hostname etc.) for the "Linked instances" list. */
    @Column(name = "name", length = 255)
    private String name;

    /** Insert time; Hibernate populates this on persist (DB DEFAULT is belt-and-braces). */
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /** Stamped when the device credential last authenticated; powers staleness display. */
    @Column(name = "last_seen_at")
    private LocalDateTime lastSeenAt;

    /** NULL = active. Set on unlink/revoke; a revoked credential fails authentication. */
    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;
}
