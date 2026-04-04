package stirling.software.proprietary.model;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Tracks credit balances for SaaS users. */
@Entity
@Table(name = "user_credits")
@Getter
@Setter
@NoArgsConstructor
public class UserCredits {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", unique = true, nullable = false)
    private Long userId;

    /** Credits allocated per week based on plan tier. */
    @Column(name = "weekly_credits_allocated", nullable = false)
    private int weeklyCreditsAllocated;

    /** Remaining weekly credits (reset each week). */
    @Column(name = "weekly_credits_remaining", nullable = false)
    private int weeklyCreditsRemaining;

    /** Purchased credit balance (never resets, only decremented on use). */
    @Column(name = "bought_credits_remaining", nullable = false)
    private int boughtCreditsRemaining;

    /** Total credits ever purchased (for display/stats). */
    @Column(name = "total_bought_credits", nullable = false)
    private int totalBoughtCredits;

    /** When the weekly credits will next reset. */
    @Column(name = "weekly_reset_date")
    private LocalDateTime weeklyResetDate;

    /** Last time credits were consumed via API/tool usage. */
    @Column(name = "last_api_usage")
    private LocalDateTime lastApiUsage;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    /** Total available credits (weekly + bought). */
    public int getTotalAvailableCredits() {
        return weeklyCreditsRemaining + boughtCreditsRemaining;
    }
}
