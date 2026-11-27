package stirling.software.proprietary.mcp.oauth.model;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** A refresh token, stored as a SHA-256 hash so the database never holds the usable secret. */
@Entity
@Table(name = "mcp_oauth_refresh_tokens")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class McpRefreshToken {

    @Id
    @Column(name = "token_hash", length = 64)
    private String tokenHash;

    @Column(name = "client_id", nullable = false, length = 512)
    private String clientId;

    @Column(name = "username", nullable = false, length = 255)
    private String username;

    @Column(name = "scope", length = 512)
    private String scope;

    @Column(name = "resource", length = 512)
    private String resource;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    /** Set when rotated; a consumed token presented again revokes the client's sessions. */
    @Column(name = "consumed_at")
    private Instant consumedAt;
}
