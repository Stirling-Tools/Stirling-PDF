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

/** The one in-flight "connect this server" handshake, instance side. */
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

    /** Correlator we minted. */
    @Column(name = "nonce", nullable = false, length = 128)
    private String nonce;

    /** Secret we minted and sent to SaaS server to server. */
    @Column(name = "claim_secret", nullable = false, length = 128)
    private String claimSecret;

    /** Where we asked the approval page to send the admin back to. */
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
