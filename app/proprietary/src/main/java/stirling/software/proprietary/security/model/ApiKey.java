package stirling.software.proprietary.security.model;

import java.io.Serializable;
import java.time.Instant;

import jakarta.persistence.*;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A named API key belonging to a user (and optionally scoped to a team). The raw secret is shown
 * once at creation and never stored; only its SHA-256 hash is persisted, so a leaked database row
 * cannot be replayed. Distinct from the legacy single {@code users.apiKey} column, which stays a
 * per-user personal key for backward compatibility.
 */
@Entity
@Table(
        name = "api_keys",
        indexes = {
            @Index(name = "idx_api_key_hash", columnList = "key_hash", unique = true),
            @Index(name = "idx_api_key_owner", columnList = "owner_user_id"),
            @Index(name = "idx_api_key_team", columnList = "team_id")
        })
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApiKey implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    /** SHA-256 hex of the raw key; the raw value is never persisted. */
    @Column(name = "key_hash", nullable = false, unique = true, length = 64)
    private String keyHash;

    /** Non-secret leading fragment of the raw key, shown in listings (e.g. {@code sk_a1b2c3d4}). */
    @Column(name = "prefix", nullable = false, length = 32)
    private String prefix;

    /** The user who created and owns the key; a team key still authenticates as this user. */
    @Column(name = "owner_user_id", nullable = false)
    private Long ownerUserId;

    /** Team the key is scoped to, or null for a personal key. */
    @Column(name = "team_id")
    private Long teamId;

    @Enumerated(EnumType.STRING)
    @Column(name = "scope", nullable = false)
    private ApiKeyScope scope;

    /**
     * How much power the key carries; a shared (team) key is always {@link
     * ApiKeyAccess#PROCESSING}.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "access", nullable = false)
    @Builder.Default
    private ApiKeyAccess access = ApiKeyAccess.FULL;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_used_at")
    private Instant lastUsedAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    /** Active = enabled and not revoked; only active keys authenticate. */
    public boolean isActive() {
        return enabled && revokedAt == null;
    }
}
