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
 * <p>Deliberately a separate table from {@link UsageCounter} rather than a scoped column on it: the
 * local grant and a linked team's cloud wallet are independent ledgers, and separating them at the
 * table keeps that structural instead of conditional — {@link UsageSyncService} reads only {@link
 * UsageCounter}, so pre-link free-tier accrual cannot leak into the first cloud sync, and no
 * bookkeeping has to be run over these rows when the instance links or unlinks. It also avoids the
 * key collision a shared table would allow, since a locally-anchored period start and a Stripe
 * period start can land on the same timestamp.
 *
 * <p>There is no {@code last_synced_units} twin of {@link UsageCounter}'s: local free-tier usage is
 * never reported to SaaS.
 *
 * <p>Auto-created by Hibernate ({@code ddl-auto=update}); written only by {@link
 * FreeTierUsageService}.
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

    /** Inclusive start of the free-tier period this counter belongs to. */
    @Column(name = "period_start", nullable = false)
    private LocalDateTime periodStart;

    /** {@code BillingCategory} name — API / AI / AUTOMATION (never BYPASSED). */
    @Column(name = "category", nullable = false, length = 32)
    private String category;

    /** Running total of units spent against the grant in this period+category. */
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
