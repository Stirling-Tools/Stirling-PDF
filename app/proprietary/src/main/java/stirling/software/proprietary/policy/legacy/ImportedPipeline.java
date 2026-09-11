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
 * A converted legacy config. The row outlives the policy it created; that is what stops the config
 * being re-imported from a file still on disk.
 */
@Entity
@Table(name = "policy_imported_pipelines")
@NoArgsConstructor
@Getter
@Setter
public class ImportedPipeline implements Serializable {

    private static final long serialVersionUID = 1L;

    /** Bounded by the caller: a key longer than this cannot be stored as the primary key. */
    public static final int MAX_KEY_LENGTH = 100;

    @Id
    @Column(name = "import_key", length = MAX_KEY_LENGTH)
    private String importKey;

    @Column(name = "imported_at")
    private Instant importedAt;

    public ImportedPipeline(String importKey, Instant importedAt) {
        this.importKey = importKey;
        this.importedAt = importedAt;
    }
}
