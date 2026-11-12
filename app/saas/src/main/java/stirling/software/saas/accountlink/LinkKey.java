package stirling.software.saas.accountlink;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A one-time key a team leader creates so a self-hosted server can link without anyone signing in
 * on it. The server redeems the key for its own {@link LinkedInstance} credential.
 *
 * <p>Twin of the {@code account_link_key} Supabase migration in Stirling-PDF-SaaS.
 */
@Entity
@Table(
        name = "account_link_key",
        indexes =
                @Index(name = "idx_account_link_key_team", columnList = "team_id,created_at DESC"))
@Getter
@Setter
@NoArgsConstructor
public class LinkKey {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Public half of the key. */
    @Column(name = "key_id", nullable = false, unique = true, length = 32)
    private String keyId;

    /** SHA-256 hex of the secret half; the secret itself is never stored. */
    @Column(name = "secret_hash", nullable = false, length = 64)
    private String secretHash;

    @Column(name = "team_id", nullable = false)
    private Long teamId;

    /** Becomes the linked instance's {@code created_by_user_id}, so synced usage bills to them. */
    @Column(name = "created_by_user_id")
    private Long createdByUserId;

    @Column(name = "name", length = 255)
    private String name;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "redeemed_at")
    private LocalDateTime redeemedAt;

    @Column(name = "instance_id")
    private Long instanceId;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    public boolean isUsable(LocalDateTime now) {
        return redeemedAt == null && revokedAt == null && expiresAt.isAfter(now);
    }
}
