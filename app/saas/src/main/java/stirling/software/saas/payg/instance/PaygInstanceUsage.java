package stirling.software.saas.payg.instance;

import java.time.LocalDateTime;

import org.hibernate.annotations.UpdateTimestamp;

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
import lombok.Setter;

/**
 * Last-seen cumulative usage a linked self-hosted instance has reported for one {@code (team,
 * billing period, category)} (combined-billing "Mode A"). The instance reports monotonic cumulative
 * unit totals on its daily sync; SaaS bills {@code reportedCumulative - lastCumulativeUnits} via
 * the standard charge path and advances this row. {@code lastSyncSeq} dedups replays.
 */
@Entity
@Table(
        name = "payg_instance_usage",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uk_payg_instance_usage",
                        columnNames = {"team_id", "period_start", "category"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PaygInstanceUsage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "team_id", nullable = false)
    private Long teamId;

    @Column(name = "period_start", nullable = false)
    private LocalDateTime periodStart;

    /** {@code BillingCategory} name — API / AI / AUTOMATION. */
    @Column(name = "category", nullable = false, length = 32)
    private String category;

    @Column(name = "last_cumulative_units", nullable = false)
    private long lastCumulativeUnits;

    @Column(name = "last_sync_seq", nullable = false)
    private long lastSyncSeq;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public PaygInstanceUsage(
            Long teamId,
            LocalDateTime periodStart,
            String category,
            long lastCumulativeUnits,
            long lastSyncSeq) {
        this.teamId = teamId;
        this.periodStart = periodStart;
        this.category = category;
        this.lastCumulativeUnits = lastCumulativeUnits;
        this.lastSyncSeq = lastSyncSeq;
    }
}
