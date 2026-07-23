package stirling.software.proprietary.security.model;

import java.io.Serializable;
import java.util.Objects;

/** Composite key for {@link ApiKeyDailyUsage}: one row per key per UTC day. */
public class ApiKeyDailyUsageId implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long apiKeyId;
    private long epochDay;

    public ApiKeyDailyUsageId() {}

    public ApiKeyDailyUsageId(Long apiKeyId, long epochDay) {
        this.apiKeyId = apiKeyId;
        this.epochDay = epochDay;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof ApiKeyDailyUsageId other)) {
            return false;
        }
        return epochDay == other.epochDay && Objects.equals(apiKeyId, other.apiKeyId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(apiKeyId, epochDay);
    }
}
