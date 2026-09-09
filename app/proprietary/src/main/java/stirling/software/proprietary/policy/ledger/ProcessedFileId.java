package stirling.software.proprietary.policy.ledger;

import java.io.Serializable;
import java.util.Objects;

/** Composite key for {@link ProcessedFileEntity}: one row per policy per file identity. */
public class ProcessedFileId implements Serializable {

    private static final long serialVersionUID = 1L;

    private String policyId;
    private String identityHash;

    public ProcessedFileId() {}

    public ProcessedFileId(String policyId, String identityHash) {
        this.policyId = policyId;
        this.identityHash = identityHash;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof ProcessedFileId other)) {
            return false;
        }
        return Objects.equals(policyId, other.policyId)
                && Objects.equals(identityHash, other.identityHash);
    }

    @Override
    public int hashCode() {
        return Objects.hash(policyId, identityHash);
    }
}
