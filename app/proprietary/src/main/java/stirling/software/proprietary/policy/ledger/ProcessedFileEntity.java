package stirling.software.proprietary.policy.ledger;

import java.io.Serializable;

import org.springframework.data.domain.Persistable;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One processed-file ledger row: what version of a file ({@code signature}) a policy last settled
 * at, and where it is in the claim lifecycle. {@code identityHash} (SHA-256 of the source-owned
 * identity string) is the key component so arbitrarily long identities fit a fixed-width index; the
 * full {@code identity} is kept alongside for inspection. {@code policyId} is a plain value, not a
 * foreign key, matching the rest of the subsystem so it stays decoupled from the security entities.
 * All mutations happen through {@code ProcessedFileRepository}'s conditional updates; the entity
 * itself is only saved for fresh inserts, so {@code isNew} is always true and a lost insert race
 * surfaces as a constraint violation rather than a silent merge.
 */
@Entity
@Table(name = "policy_processed_files")
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
            ProcessedFileStatus status,
            long nowMillis) {
        this.policyId = policyId;
        this.identityHash = identityHash;
        this.identity = identity;
        this.signature = signature;
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
