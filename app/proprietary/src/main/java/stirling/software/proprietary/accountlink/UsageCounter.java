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

import stirling.software.proprietary.billing.BillingCategory;

/**
 * Durable per-(billing period, category) cumulative usage counter for combined-billing "Mode A".
 * Each successful billable op increments its row; the daily sync reports the cumulative totals and
 * SaaS bills the delta since the last sync. The cumulative model is idempotent (a resend bills
 * nothing) and tamper-evident (a counter that drops is a signal). One row per {@code (period_start,
 * category)}, auto-created by Hibernate; only the flag-gated {@link UsageMeterService} writes it.
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

    /**
     * {@link #cumulativeUnits} as of the last sync SaaS accepted; the difference is the unreported
     * usage the portal shows on top of SaaS-synced spend. The {@code columnDefinition} default
     * keeps the {@code ddl-auto=update} ADD COLUMN safe against a table an earlier build already
     * populated (NOT NULL with no default would fail the ALTER).
     */
    @Column(
            name = "last_synced_units",
            nullable = false,
            columnDefinition = "bigint not null default 0")
    private long lastSyncedUnits;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /** Fresh-accrual row: nothing synced yet. */
    public UsageCounter(
            LocalDateTime periodStart,
            String category,
            long cumulativeUnits,
            LocalDateTime updatedAt) {
        this(periodStart, category, cumulativeUnits, 0L, updatedAt);
    }

    public UsageCounter(
            LocalDateTime periodStart,
            String category,
            long cumulativeUnits,
            long lastSyncedUnits,
            LocalDateTime updatedAt) {
        this.periodStart = periodStart;
        this.category = category;
        this.cumulativeUnits = cumulativeUnits;
        this.lastSyncedUnits = lastSyncedUnits;
        this.updatedAt = updatedAt;
    }

    /** This row's category as the enum, or {@code null} for an unrecognised stored value. */
    public BillingCategory billingCategory() {
        try {
            return BillingCategory.valueOf(category);
        } catch (IllegalArgumentException unknown) {
            return null;
        }
    }

    /** Units accrued but not yet accepted by SaaS (floored at 0). */
    public long unsyncedUnits() {
        return Math.max(0, cumulativeUnits - lastSyncedUnits);
    }
}
