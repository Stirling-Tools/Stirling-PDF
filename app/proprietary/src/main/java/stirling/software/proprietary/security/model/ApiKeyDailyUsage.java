package stirling.software.proprietary.security.model;

import java.io.Serializable;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One UTC day's request tally for an API key. Rolling "today"/"this month" usage is summed from
 * these rows, keeping the table at one row per key per active day rather than one per request.
 */
@Entity
@Table(name = "api_key_daily_usage")
@IdClass(ApiKeyDailyUsageId.class)
@Getter
@Setter
@NoArgsConstructor
public class ApiKeyDailyUsage implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "api_key_id")
    private Long apiKeyId;

    @Id
    @Column(name = "epoch_day")
    private long epochDay;

    @Column(name = "count")
    private long count;

    public ApiKeyDailyUsage(Long apiKeyId, long epochDay, long count) {
        this.apiKeyId = apiKeyId;
        this.epochDay = epochDay;
        this.count = count;
    }
}
