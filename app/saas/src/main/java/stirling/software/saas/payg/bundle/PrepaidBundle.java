package stirling.software.saas.payg.bundle;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A prepaid, expiring pool of PDF-process units bought up-front at a discount ("12 months for the
 * price of 10"). Consumed after the team's free grant and before the meter (free -> prepaid ->
 * metered); draws are booked to the {@code BOUGHT} ledger bucket, so a bundle never counts toward
 * the spend cap or the Stripe meter.
 *
 * <p>Carries only capacity + term + the Stripe link. The one-time amount and currency live on the
 * Stripe Checkout Session / PaymentIntent referenced by {@link #stripeRef}; how many units a PDF
 * costs comes from the team's pricing policy at charge time, not from the bundle. Status is
 * derived, never stored (see {@link #isDrawable}).
 *
 * <p>A team may hold several pools at once (top-ups); they are drawn FIFO by soonest {@link
 * #expiresAt}. Unused units forfeit at expiry (no roll-over).
 */
@Entity
@Table(
        name = "payg_prepaid_bundle",
        // Declared here for ddl-auto (fresh schemas) and to document intent. The authoritative creator
        // in production is the Supabase CLI migration 20260720000000_payg_prepaid_bundle, which builds
        // the partial forms (WHERE units_remaining > 0 / WHERE stripe_ref IS NOT NULL). Flyway was
        // retired for SaaS (#7100), so there is no migration twin — names match the CLI migration.
        indexes = {
            // Hot-path FIFO draw lookup — findDrawableForUpdate runs a locked read on every billable
            // charge past the free grant; without it that degrades to a locked scan as the table grows.
            @Index(
                    name = "idx_payg_prepaid_bundle_team_expiry",
                    columnList = "team_id, expires_at"),
            // One pool per Stripe payment — the idempotency guard so a redelivered invoice.paid can't
            // credit the same purchase twice.
            @Index(
                    name = "uq_payg_prepaid_bundle_stripe_ref",
                    columnList = "stripe_ref",
                    unique = true),
        })
@NoArgsConstructor
@Getter
@Setter
public class PrepaidBundle implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "bundle_id")
    private Long id;

    @Column(name = "team_id", nullable = false)
    private Long teamId;

    /** Capacity granted at purchase — the denominator of the "X of Y used" meter. */
    @Column(name = "units_total", nullable = false)
    private long unitsTotal;

    /** Live balance; pessimistic-locked on draw. */
    @Column(name = "units_remaining", nullable = false)
    private long unitsRemaining;

    @Column(name = "purchased_at", nullable = false)
    private LocalDateTime purchasedAt;

    /** {@code purchasedAt + 12 months}. Unused units forfeit after this instant. */
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    /**
     * Stripe Checkout Session / PaymentIntent id for the one-time payment that created this pool.
     * The amount + currency + receipt live on that object; a unique index makes the webhook credit
     * idempotent. {@code null} only for pools seeded outside the purchase flow (tests/backfill).
     */
    @Column(name = "stripe_ref", length = 128)
    private String stripeRef;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /** In-term (not yet expired) as of {@code now} — regardless of remaining balance. */
    public boolean isInTerm(LocalDateTime now) {
        return expiresAt.isAfter(now);
    }

    /** Has units left AND is still in term — i.e. a charge may draw from it. */
    public boolean isDrawable(LocalDateTime now) {
        return unitsRemaining > 0 && isInTerm(now);
    }
}
