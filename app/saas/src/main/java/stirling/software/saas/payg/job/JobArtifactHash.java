package stirling.software.saas.payg.job;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.saas.payg.model.ArtifactKind;

/**
 * Per-step input/output content hash. Used by the lineage detector to decide whether a tool call
 * joins an open process (matching an earlier input or output) or opens a new one.
 */
@Entity
@Table(name = "job_artifact_hash")
@NoArgsConstructor
@Getter
@Setter
public class JobArtifactHash implements Serializable {

    private static final long serialVersionUID = 1L;

    @EmbeddedId private JobArtifactHashId id;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Embeddable
    @NoArgsConstructor
    @Getter
    @Setter
    public static class JobArtifactHashId implements Serializable {

        private static final long serialVersionUID = 1L;

        @Column(name = "job_id", nullable = false)
        private UUID jobId;

        /** {@code "type:value"} signature key; 128 chars fits SHA-256 plus future schemes. */
        @Column(name = "content_hash", nullable = false, length = 128)
        private String contentHash;

        @Enumerated(EnumType.STRING)
        @Column(name = "kind", nullable = false, length = 8)
        private ArtifactKind kind;

        public JobArtifactHashId(UUID jobId, String contentHash, ArtifactKind kind) {
            this.jobId = jobId;
            this.contentHash = contentHash;
            this.kind = kind;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof JobArtifactHashId other)) return false;
            return Objects.equals(jobId, other.jobId)
                    && Objects.equals(contentHash, other.contentHash)
                    && kind == other.kind;
        }

        @Override
        public int hashCode() {
            return Objects.hash(jobId, contentHash, kind);
        }
    }
}
