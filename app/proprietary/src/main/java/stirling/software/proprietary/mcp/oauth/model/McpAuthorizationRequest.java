package stirling.software.proprietary.mcp.oauth.model;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** One in-flight authorization; the code lives on the same row for a single lookup at /token. */
@Entity
@Table(name = "mcp_oauth_authorization_requests")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class McpAuthorizationRequest {

    public enum Status {
        PENDING,
        APPROVED,
        DENIED,
        CONSUMED
    }

    /** Opaque id handed to the consent screen in the query string. */
    @Id
    @Column(name = "authorization_id", length = 64)
    private String authorizationId;

    @Column(name = "client_id", nullable = false, length = 512)
    private String clientId;

    /** Stirling username that started the authorization. */
    @Column(name = "username", nullable = false, length = 255)
    private String username;

    @Column(name = "redirect_uri", nullable = false, length = 2048)
    private String redirectUri;

    @Column(name = "state", length = 1024)
    private String state;

    @Column(name = "scope", length = 512)
    private String scope;

    /** RFC 8707 resource; echoed into the token audience. */
    @Column(name = "resource", length = 512)
    private String resource;

    @Column(name = "code_challenge", length = 256)
    private String codeChallenge;

    @Column(name = "code_challenge_method", length = 16)
    private String codeChallengeMethod;

    /** Set on approval; single-use at the token endpoint. */
    @Column(name = "code", length = 64)
    private String code;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private Status status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
}
