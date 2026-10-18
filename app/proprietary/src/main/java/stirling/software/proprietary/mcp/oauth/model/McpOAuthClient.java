package stirling.software.proprietary.mcp.oauth.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** A public MCP client (code + PKCE, never a secret), registered via DCR or a metadata URL. */
@Entity
@Table(name = "mcp_oauth_clients")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class McpOAuthClient {

    /** Random id for DCR clients, or the https metadata document URL for CIMD clients. */
    @Id
    @Column(name = "client_id", length = 512)
    private String clientId;

    @Column(name = "client_name", length = 255)
    private String clientName;

    /** Exact-match redirect URIs; a request URI not listed here is rejected. */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "mcp_oauth_client_redirect_uris",
            joinColumns = @JoinColumn(name = "client_id"))
    @Column(name = "redirect_uri", length = 2048)
    @Builder.Default
    private List<String> redirectUris = new ArrayList<>();

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_used_at")
    private Instant lastUsedAt;

    @Column(name = "dynamically_registered", nullable = false)
    private boolean dynamicallyRegistered;

    /** True when the client is described by a fetched Client ID Metadata Document. */
    @Column(name = "metadata_document", nullable = false)
    private boolean metadataDocument;
}
