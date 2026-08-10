package stirling.software.proprietary.policy.legacy;

import java.io.Serializable;
import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A legacy pipeline config that has been offered as a policy, keyed by its import key. The row is
 * never removed when the policy it created is deleted - that is the point: its presence is what
 * stops the config being re-imported from a file that is still on disk.
 */
@Entity
@Table(name = "policy_imported_pipelines")
@NoArgsConstructor
@Getter
@Setter
public class ImportedPipeline implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "import_key")
    private String importKey;

    @Column(name = "imported_at")
    private Instant importedAt;

    public ImportedPipeline(String importKey, Instant importedAt) {
        this.importKey = importKey;
        this.importedAt = importedAt;
    }
}
