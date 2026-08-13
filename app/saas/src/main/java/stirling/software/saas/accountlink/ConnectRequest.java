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

/**
 * One in-flight "connect this server to a Stirling account" handshake.
 *
 * <p>Created by the self-hosted instance itself (server to server, before it holds any credential),
 * then approved by a team leader in a browser on our origin. The browser only ever carries {@link
 * #requestId}, so the redirect target is read from this row rather than from a query parameter —
 * that is what stops the flow being an open redirect that leaks a live session token.
 *
 * <p>Two distinct secrets, deliberately not interchangeable:
 *
 * <ul>
 *   <li>{@code nonce} travels back through the browser in the URL fragment. It only proves to the
 *       instance that a callback corresponds to a handshake it started, so it is a correlator
 *       rather than a bearer token and is stored as-is. It is single use and short lived.
 *   <li>{@code claimSecretHash} is the SHA-256 of a secret that never touches the browser. Only the
 *       instance that created this row can present it, and presenting it is what mints the device
 *       credential. Storing only the hash keeps this row useless to a reader.
 * </ul>
 *
 * <p>The device credential is minted at claim time, not at approval time, so no plaintext secret is
 * ever persisted here waiting to be collected.
 */
/*
 * Only one index is declared. request_id is already UNIQUE on the column, which carries its own
 * index, and nothing queries expires_at: expiry is evaluated in Java after loading a row by id,
 * and there is no sweep. The remaining index serves the per-IP creation cap, which is the one
 * query here that is not a primary-key lookup.
 */
@Entity
@Table(
        name = "account_link_connect_request",
        indexes = @Index(name = "idx_alcr_ip_created", columnList = "requester_ip,created_at"))
@Getter
@Setter
@NoArgsConstructor
public class ConnectRequest {

    /**
     * What the handshake is for. The distinction is not cosmetic: it decides whether a credential
     * is minted, who may approve, and whether the team is already known.
     */
    public enum Mode {
        /**
         * First link. No team is known until a leader approves, and approval is what decides it.
         * Claiming mints a device credential.
         */
        LINK,
        /**
         * The instance is already linked and only needs the admin's browser signed in again. The
         * team is pinned at creation from the instance's own device credential, so approval cannot
         * move the instance to a different team, and claiming mints nothing.
         */
        REAUTH
    }

    public enum Status {
        /** Waiting for a leader to approve or deny. */
        PENDING,
        /** A leader approved; the instance has not collected its credential yet. */
        APPROVED,
        /** A leader declined. Terminal. */
        DENIED,
        /** The instance collected its credential. Terminal, and enforces single use. */
        CONSUMED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Opaque public handle carried in the approval URL. Not a secret, and not guessable. */
    @Column(name = "request_id", nullable = false, unique = true, length = 64)
    private String requestId;

    /** Instance-supplied label shown to the approver alongside the origin. */
    @Column(name = "name", length = 255)
    private String name;

    /** Absolute URL the approver's browser is sent back to. Never taken from the query string. */
    @Column(name = "callback_url", nullable = false, length = 2048)
    private String callbackUrl;

    /**
     * Scheme, host and port of {@link #callbackUrl}, extracted at creation. Shown to the approver,
     * who is the control that this really is their server.
     */
    @Column(name = "callback_origin", nullable = false, length = 255)
    private String callbackOrigin;

    /** Correlator echoed back through the browser fragment. See the class comment. */
    @Column(name = "nonce", nullable = false, length = 128)
    private String nonce;

    /** SHA-256 hex of the instance's claim secret; the secret itself is never stored. */
    @Column(name = "claim_secret_hash", nullable = false, length = 64)
    private String claimSecretHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "mode", nullable = false, length = 16)
    private Mode mode = Mode.LINK;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private Status status = Status.PENDING;

    /**
     * For {@link Mode#LINK}, set on approval: approval is what decides the team. For {@link
     * Mode#REAUTH}, set at creation from the instance's device credential, and approval may only
     * confirm it. That is what stops a re-authentication silently moving a server between teams, or
     * leaving the browser signed into an account that does not own the server it is looking at.
     */
    @Column(name = "team_id")
    private Long teamId;

    /** Leader who approved. Informational, and carried onto the minted credential. */
    @Column(name = "approved_by_user_id")
    private Long approvedByUserId;

    /** Source address of the creating call, for the per-IP creation cap. */
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

    /** Expiry is checked on read rather than swept, so a stale row simply stops working. */
    public boolean isExpired(LocalDateTime now) {
        return expiresAt != null && expiresAt.isBefore(now);
    }
}
