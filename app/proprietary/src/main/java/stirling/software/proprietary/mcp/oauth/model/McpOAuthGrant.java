package stirling.software.proprietary.mcp.oauth.model;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** A standing consent for one user and client; deleting it is what "revoke access" does. */
@Entity
@Table(
        name = "mcp_oauth_grants",
        uniqueConstraints = @UniqueConstraint(columnNames = {"username", "client_id"}))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class McpOAuthGrant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "username", nullable = false, length = 255)
    private String username;

    // The account's id at consent, so a deleted and re-created username starts with no access.
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "client_id", nullable = false, length = 512)
    private String clientId;

    @Column(name = "scope", length = 512)
    private String scope;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_used_at")
    private Instant lastUsedAt;
}
