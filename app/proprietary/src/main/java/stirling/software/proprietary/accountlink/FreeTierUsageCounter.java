package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Durable per-(free-tier period, category) usage counter for the instance's own monthly grant.
 *
 * <p>A separate table from {@link UsageCounter}, not a scoped column on it: {@link
 * UsageSyncService} reads only that one, so pre-link accrual cannot leak into the first cloud sync,
 * and a locally-anchored period start can collide with a Stripe one on the same timestamp. Hence no
 * {@code last_synced_units} twin either, local usage never being reported.
 *
 * <p>Written only by {@link FreeTierUsageService}.
 */
@Entity
@Table(
        name = "account_link_free_tier_usage",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uk_free_tier_usage_period_category",
                        columnNames = {"period_start", "category"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FreeTierUsageCounter {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Inclusive. */
    @Column(name = "period_start", nullable = false)
    private LocalDateTime periodStart;

    /** {@code BillingCategory} name — API / AI / AUTOMATION (never BYPASSED). */
    @Column(name = "category", nullable = false, length = 32)
    private String category;

    @Column(name = "cumulative_units", nullable = false)
    private long cumulativeUnits;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public FreeTierUsageCounter(
            LocalDateTime periodStart,
            String category,
            long cumulativeUnits,
            LocalDateTime updatedAt) {
        this.periodStart = periodStart;
        this.category = category;
        this.cumulativeUnits = cumulativeUnits;
        this.updatedAt = updatedAt;
    }
}
