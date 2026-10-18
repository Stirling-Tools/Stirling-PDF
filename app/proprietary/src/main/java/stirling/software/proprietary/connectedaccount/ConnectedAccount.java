package stirling.software.proprietary.connectedaccount;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.integration.crypto.EncryptedStringConverter;

/**
 * A user's own Microsoft or Google account, connected once and used by both the editor's file
 * pickers and that user's pipelines. Holds the provider's refresh token, encrypted at rest; access
 * tokens are minted from it on demand and never stored. Provider and status are plain strings
 * rather than enums, so a new provider never meets a frozen database enum.
 */
@Entity
@Table(
        name = "connected_accounts",
        indexes = @Index(name = "idx_connected_accounts_owner", columnList = "owner_user_id"),
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uk_connected_accounts_identity",
                        columnNames = {"owner_user_id", "provider", "external_id"}))
@NoArgsConstructor
@Getter
@Setter
public class ConnectedAccount implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String STATUS_CONNECTED = "CONNECTED";
    public static final String STATUS_NEEDS_RECONNECT = "NEEDS_RECONNECT";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "connected_account_id")
    private Long id;

    @Column(name = "owner_user_id", nullable = false)
    private Long ownerUserId;

    @Column(name = "provider", nullable = false, length = 32)
    private String provider;

    /** The provider's stable id for the account: Entra object id, or Google subject. */
    @Column(name = "external_id", nullable = false)
    private String externalId;

    /** Entra tenant id the account signed in from; null for Google. */
    @Column(name = "tenant_id")
    private String tenantId;

    @Column(name = "email")
    private String email;

    @Column(name = "display_name")
    private String displayName;

    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "refresh_token_encrypted", columnDefinition = "text")
    private String refreshToken;

    @Column(name = "granted_scopes", columnDefinition = "text")
    private String grantedScopes;

    @Column(name = "status", nullable = false, length = 32)
    private String status = STATUS_CONNECTED;

    @Column(name = "last_error", columnDefinition = "text")
    private String lastError;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public CloudProvider cloudProvider() {
        return CloudProvider.fromId(provider);
    }
}
