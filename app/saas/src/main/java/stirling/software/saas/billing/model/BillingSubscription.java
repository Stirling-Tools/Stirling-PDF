package stirling.software.saas.billing.model;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Stripe billing subscription mirror. A row appears here when Supabase webhooks the server to
 * record a tenant's subscription state.
 */
@Entity
@Table(name = "billing_subscriptions")
@NoArgsConstructor
@Getter
@Setter
public class BillingSubscription implements Serializable {

    private static final long serialVersionUID = 1L;

    /** Stripe subscription ID. */
    @Id
    @Column(name = "id")
    private String id;

    /** Supabase auth user ID owning this subscription. */
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** Optional team ID if this subscription is at team level rather than per-user. */
    @Column(name = "team_id")
    private Long teamId;

    /** Stripe subscription status: active, trialing, past_due, canceled, etc. */
    @Column(name = "status", nullable = false)
    private String status;

    /** Stripe price ID. */
    @Column(name = "price_id")
    private String priceId;

    @Column(name = "current_period_end")
    private LocalDateTime currentPeriodEnd;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public boolean isActive() {
        return "active".equalsIgnoreCase(status)
                || "trialing".equalsIgnoreCase(status)
                || "past_due".equalsIgnoreCase(status);
    }

    public boolean isValid() {
        return isActive()
                && (currentPeriodEnd == null || currentPeriodEnd.isAfter(LocalDateTime.now()));
    }
}
