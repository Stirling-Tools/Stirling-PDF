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
 * The one in-flight "connect this server" handshake, instance side. Singleton, like {@link
 * DeviceCredential}: an instance links to exactly one team, so it only ever has one handshake open.
 *
 * <p>In the database rather than in memory because the browser hop can land on a different replica
 * than the one that started the handshake. Behind an ingress with more than one pod, an in-memory
 * nonce would simply fail to be found about half the time.
 *
 * <p>Holds both secrets in plaintext, for the same reason {@link DeviceCredential} holds the device
 * secret in plaintext: this side has to present them, not verify a hash. The nonce is compared
 * against what the callback carries, and the claim secret is what collects the credential.
 *
 * <p>The row's existence <em>is</em> the "waiting for approval" state. It is deleted on completion
 * or cancellation, so there is no status column to keep in step with reality.
 */
@Entity
@Table(name = "account_link_connect_state")
@NoArgsConstructor
@Getter
@Setter
public class ConnectState implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final Long SINGLETON_ID = 1L;

    @Id
    @Column(name = "id")
    private Long id = SINGLETON_ID;

    /** Opaque handle the SaaS side gave us; identifies the handshake on both sides. */
    @Column(name = "request_id", nullable = false, length = 64)
    private String requestId;

    /** Correlator we minted. A callback that does not carry this one is not ours. */
    @Column(name = "nonce", nullable = false, length = 128)
    private String nonce;

    /**
     * Secret we minted and sent to SaaS server to server. Never leaves this process for a browser.
     */
    @Column(name = "claim_secret", nullable = false, length = 128)
    private String claimSecret;

    /** Where we asked the approval page to send the admin back to. Kept for display and support. */
    @Column(name = "callback_url", nullable = false, length = 2048)
    private String callbackUrl;

    /** The approval URL handed to the browser, so a reload can offer it again. */
    @Column(name = "authorize_url", nullable = false, length = 2048)
    private String authorizeUrl;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    public boolean isExpired(LocalDateTime now) {
        return expiresAt != null && expiresAt.isBefore(now);
    }
}
