package stirling.software.proprietary.policy.source;

import java.io.Serializable;
import java.util.Objects;

/** Composite key for {@link SourceDocCountEntity}: one row per source per hour bucket. */
public class SourceDocCountId implements Serializable {

    private static final long serialVersionUID = 1L;

    private String sourceId;
    private long bucketHour;

    public SourceDocCountId() {}

    public SourceDocCountId(String sourceId, long bucketHour) {
        this.sourceId = sourceId;
        this.bucketHour = bucketHour;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof SourceDocCountId other)) {
            return false;
        }
        return bucketHour == other.bucketHour && Objects.equals(sourceId, other.sourceId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(sourceId, bucketHour);
    }
}
