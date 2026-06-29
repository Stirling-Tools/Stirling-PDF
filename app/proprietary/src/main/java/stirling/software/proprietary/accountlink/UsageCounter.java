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
 * Durable per-(billing period, category) cumulative usage counter for combined-billing "Mode A"
 * metering. Each successful billable operation increments the matching row; the daily sync reports
 * these cumulative totals and SaaS bills the <em>delta</em> since the last sync — the cumulative
 * model is idempotent (a resend bills nothing) and tamper-evident (a counter that drops is a
 * signal).
 *
 * <p>One row per {@code (period_start, category)}. Auto-created by Hibernate ({@code
 * ddl-auto=update} on self-hosted); only the flag-gated {@link UsageMeterService} writes it, so
 * when metering is off the table is simply an empty additive table.
 */
@Entity
@Table(
        name = "account_link_usage_counter",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uk_usage_counter_period_category",
                        columnNames = {"period_start", "category"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UsageCounter {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Inclusive start of the billing period this counter belongs to (from the entitlement sync).
     */
    @Column(name = "period_start", nullable = false)
    private LocalDateTime periodStart;

    /** {@code BillingCategory} name — API / AI / AUTOMATION (never BYPASSED). */
    @Column(name = "category", nullable = false, length = 32)
    private String category;

    /** Running total of metered units in this period+category. */
    @Column(name = "cumulative_units", nullable = false)
    private long cumulativeUnits;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public UsageCounter(
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
