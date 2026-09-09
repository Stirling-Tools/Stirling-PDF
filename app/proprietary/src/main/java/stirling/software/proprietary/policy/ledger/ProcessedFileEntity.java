package stirling.software.proprietary.policy.ledger;

import java.io.Serializable;

import org.springframework.data.domain.Persistable;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One processed-file ledger row: the version a policy last settled a file at, and where it is in
 * the claim lifecycle. Keyed by SHA-256 of the source-owned identity so any identity length fits a
 * fixed-width index. {@code isNew} is always true: the entity is only saved for fresh inserts
 * (everything else is a conditional update), so a lost insert race surfaces as a constraint
 * violation rather than a silent merge.
 */
@Entity
@Table(
        name = "policy_processed_files",
        indexes = {
            // presence cleanup: delete this policy's rows unseen since the sweep began
            @Index(name = "idx_processed_files_policy_seen", columnList = "policy_id, last_seen"),
            // cross-policy deletion consensus: existsByIdentityHashAndStatusNot filters
            // identity_hash on its own, so it cannot ride the (policy_id, identity_hash) PK
            @Index(name = "idx_processed_files_identity", columnList = "identity_hash")
        })
@IdClass(ProcessedFileId.class)
@NoArgsConstructor
@Getter
@Setter
public class ProcessedFileEntity implements Serializable, Persistable<ProcessedFileId> {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "policy_id")
    private String policyId;

    @Id
    @Column(name = "identity_hash", length = 64)
    private String identityHash;

    @Column(name = "identity", length = 4096)
    private String identity;

    @Column(name = "signature")
    private String signature;

    @Column(name = "content_hash", length = 64)
    private String contentHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 16)
    private ProcessedFileStatus status;

    @Column(name = "attempts")
    private int attempts;

    @Column(name = "last_seen")
    private long lastSeen;

    @Column(name = "updated_at")
    private long updatedAt;

    public ProcessedFileEntity(
            String policyId,
            String identityHash,
            String identity,
            String signature,
            String contentHash,
            ProcessedFileStatus status,
            long nowMillis) {
        this.policyId = policyId;
        this.identityHash = identityHash;
        this.identity = identity;
        this.signature = signature;
        this.contentHash = contentHash;
        this.status = status;
        this.attempts = 1;
        this.lastSeen = nowMillis;
        this.updatedAt = nowMillis;
    }

    @Override
    @Transient
    public ProcessedFileId getId() {
        return new ProcessedFileId(policyId, identityHash);
    }

    @Override
    @Transient
    public boolean isNew() {
        return true;
    }
}
