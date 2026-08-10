package stirling.software.proprietary.accountlink;

import java.io.Serializable;
import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * The pairing this instance currently has in flight (device grant, RFC 8628).
 *
 * <p>Singleton, like {@link DeviceCredential}: one instance pairs to one team at a time. It lives
 * in the database rather than in memory for a specific reason. On a multi-replica deployment the
 * admin's browser reaches an arbitrary pod through the ingress, so pod-local state would mean a
 * refresh landing on a different pod shows no pairing, or starts a second one with a different
 * code. A shared row makes any pod able to render and advance the same pairing.
 *
 * <p>{@code deviceCode} is held in plaintext because it is what we must present on every poll, the
 * same posture as the device secret this pairing goes on to produce.
 */
@Entity
@Table(name = "account_link_pairing_state")
@NoArgsConstructor
@Getter
@Setter
public class PairingState implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final Long SINGLETON_ID = 1L;

    @Id
    @Column(name = "id")
    private Long id = SINGLETON_ID;

    /** Display form of the code the admin types, e.g. {@code WXYZ-4821}. */
    @Column(name = "user_code", nullable = false, length = 16)
    private String userCode;

    /** The bearer secret for polling. Never rendered. */
    @Column(name = "device_code", nullable = false, length = 128)
    private String deviceCode;

    @Column(name = "verification_uri", nullable = false, length = 256)
    private String verificationUri;

    @Column(name = "interval_seconds", nullable = false)
    private int intervalSeconds;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    /** Enforces the advertised poll interval without needing a scheduler. */
    @Column(name = "last_polled_at")
    private LocalDateTime lastPolledAt;

    public boolean isExpired(LocalDateTime now) {
        return expiresAt != null && now.isAfter(expiresAt);
    }
}
