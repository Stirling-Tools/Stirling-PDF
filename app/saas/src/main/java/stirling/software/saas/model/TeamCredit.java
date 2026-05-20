package stirling.software.saas.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.model.Team;

/** Shared credit pool for multi-member teams; see {@link UserCredit} for the per-user variant. */
@Entity
@Table(name = "team_credits")
@NoArgsConstructor
@Getter
@Setter
public class TeamCredit implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "credit_id")
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "team_id", nullable = false, unique = true)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Team team;

    @Column(name = "cycle_credits_remaining")
    private Integer cycleCreditsRemaining = 0;

    @Column(name = "cycle_credits_allocated")
    private Integer cycleCreditsAllocated = 0;

    @Column(name = "bought_credits_remaining")
    private Integer boughtCreditsRemaining = 0;

    @Column(name = "total_bought_credits")
    private Integer totalBoughtCredits = 0;

    @Column(name = "last_cycle_reset_at")
    private LocalDateTime lastCycleResetAt;

    @Column(name = "last_api_usage")
    private LocalDateTime lastApiUsage;

    @Column(name = "total_api_calls_made")
    private Long totalApiCallsMade = 0L;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Version
    @Column(name = "version")
    private Long version;

    public TeamCredit(Team team) {
        this.team = team;
    }

    public int getTotalAvailableCredits() {
        return (cycleCreditsRemaining != null ? cycleCreditsRemaining : 0)
                + (boughtCreditsRemaining != null ? boughtCreditsRemaining : 0);
    }

    public boolean hasCreditsAvailable() {
        return getTotalAvailableCredits() > 0;
    }

    /**
     * Consume a credit from the team pool. Consumes cycle credits first, then bought credits.
     *
     * @return true if a credit was consumed, false if no credits available
     */
    public boolean consumeCredit() {
        if (cycleCreditsRemaining != null && cycleCreditsRemaining > 0) {
            cycleCreditsRemaining--;
            totalApiCallsMade++;
            lastApiUsage = LocalDateTime.now();
            return true;
        } else if (boughtCreditsRemaining != null && boughtCreditsRemaining > 0) {
            boughtCreditsRemaining--;
            totalApiCallsMade++;
            lastApiUsage = LocalDateTime.now();
            return true;
        }
        return false;
    }

    public void addBoughtCredits(int credits) {
        if (credits > 0) {
            boughtCreditsRemaining =
                    (boughtCreditsRemaining != null ? boughtCreditsRemaining : 0) + credits;
            totalBoughtCredits = (totalBoughtCredits != null ? totalBoughtCredits : 0) + credits;
        }
    }

    public void resetCycleCredits(int cycleAllocation, LocalDateTime resetTime) {
        this.cycleCreditsAllocated = cycleAllocation;
        this.cycleCreditsRemaining = cycleAllocation;
        this.lastCycleResetAt = resetTime;
    }

    public boolean isCycleResetDue(LocalDateTime lastScheduledReset) {
        return lastCycleResetAt == null || lastCycleResetAt.isBefore(lastScheduledReset);
    }
}
