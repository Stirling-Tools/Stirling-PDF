package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Singleton row anchoring this instance's own monthly free-tier period. A self-hosted instance that
 * has never linked has no subscription to borrow a billing cycle from, so it owns its period
 * outright: anchored at first use and rolling every month from there.
 *
 * <p>{@link #anchorAt} is written once and never moves, which is what keeps the roll drift-free —
 * deriving each start by adding a month to the <em>previous</em> start would walk a 31st anchor
 * permanently down to the 28th. {@link #periodStart} is the stamp {@link FreeTierUsageCounter} rows
 * are keyed by, rolled lazily when a read or write notices the boundary has passed, so no scheduler
 * is involved.
 *
 * <p>Auto-created by Hibernate ({@code ddl-auto=update}); written only by {@link
 * FreeTierUsageService}.
 */
@Entity
@Table(name = "account_link_free_tier_period")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FreeTierPeriod {

    /** One instance meters one free tier → one anchor row. */
    public static final long SINGLETON_ID = 1L;

    @Id private Long id;

    /** Immutable origin of every period boundary; set when the instance first meters anything. */
    @Column(name = "anchor_at", nullable = false)
    private LocalDateTime anchorAt;

    /** Inclusive start of the period in force, always {@code anchorAt} plus a whole month count. */
    @Column(name = "period_start", nullable = false)
    private LocalDateTime periodStart;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public FreeTierPeriod(LocalDateTime anchorAt) {
        this.id = SINGLETON_ID;
        this.anchorAt = anchorAt;
        this.periodStart = anchorAt;
        this.updatedAt = anchorAt;
    }
}
