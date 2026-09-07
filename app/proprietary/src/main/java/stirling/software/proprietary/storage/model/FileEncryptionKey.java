package stirling.software.proprietary.storage.model;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A scope-level key-encryption key (KEK) for storage encryption at rest. The 256-bit KEK is stored
 * AES-GCM-wrapped by the master file-encryption key; per-file data keys are wrapped by the KEK
 * inside each encrypted blob's header, so this table stays tiny (one row per scope per rotation)
 * and master-key rotation only re-wraps these rows, never file contents.
 *
 * <p>Status semantics: ACTIVE wraps new files and unwraps existing ones; RETIRED (post-rotation)
 * unwraps only; DISABLED unwraps nothing — the per-scope kill switch.
 */
@Entity
@Table(
        name = "file_encryption_keys",
        indexes = {@Index(name = "idx_file_enc_keys_scope", columnList = "scope_type,scope_id")},
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uk_file_enc_keys_scope_version",
                        columnNames = {"scope_type", "scope_id", "key_version"}))
@NoArgsConstructor
@Getter
@Setter
public class FileEncryptionKey implements Serializable {

    private static final long serialVersionUID = 1L;

    public enum ScopeType {
        GLOBAL,
        TEAM,
        SOURCE
    }

    public enum Status {
        ACTIVE,
        RETIRED,
        DISABLED
    }

    @Id
    @Column(name = "key_id", nullable = false)
    private UUID keyId;

    @Enumerated(EnumType.STRING)
    @Column(name = "scope_type", nullable = false, length = 16)
    private ScopeType scopeType;

    /** Scope discriminator (team id, source id). 0 for GLOBAL so the unique constraint holds. */
    @Column(name = "scope_id", nullable = false)
    private long scopeId;

    /** Increments when the scope KEK is rotated; the unique constraint tolerates retired rows. */
    @Column(name = "key_version", nullable = false)
    private int keyVersion;

    /** Base64 of IV(12) || AES-256-GCM(masterKey, kek) || tag(16), AAD-bound to keyId. */
    @Column(name = "wrapped_key", nullable = false, length = 512)
    private String wrappedKey;

    /** Which master-key version wrapped this row; supports master rotation re-wraps. */
    @Column(name = "master_key_version", nullable = false)
    private int masterKeyVersion;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private Status status;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "status_changed_at")
    private LocalDateTime statusChangedAt;

    @Column(name = "status_changed_by")
    private String statusChangedBy;
}
