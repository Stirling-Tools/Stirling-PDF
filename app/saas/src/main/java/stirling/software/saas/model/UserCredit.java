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
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.security.model.User;

/**
 * Per-user credit pool. Layers a renewable monthly cycle pool ({@code cycleCreditsRemaining}) over
 * a non-expiring purchased pool ({@code boughtCreditsRemaining}); cycle credits consume first.
 */
@Entity
@Table(name = "user_credits")
@NoArgsConstructor
@Getter
@Setter
public class UserCredit implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "credit_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private User user;

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

    public UserCredit(User user) {
        this.user = user;
        // Cycle credits are initialized by CreditService after this object is created,
        // typically during user registration or at the start of a new billing cycle,
        // using values from the application configuration.
    }

    public int getTotalAvailableCredits() {
        return (cycleCreditsRemaining != null ? cycleCreditsRemaining : 0)
                + (boughtCreditsRemaining != null ? boughtCreditsRemaining : 0);
    }

    public boolean hasCreditsAvailable() {
        return getTotalAvailableCredits() > 0;
    }

    public boolean consumeCredit() {
        // Consume cycle credits first, then bought credits.
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
