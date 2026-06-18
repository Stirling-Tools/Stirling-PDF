package stirling.software.saas.payg.policy;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.model.Team;

/**
 * Sidecar carrying PAYG-only team fields. 1:1 with {@link Team} via shared PK so OSS Hibernate
 * (which only sees the proprietary {@link Team} entity) never tries to add PAYG columns to the
 * shared {@code teams} table. Mirrors the existing {@code SaasTeamExtensions} pattern.
 *
 * <p>Created lazily on first PAYG access for a team.
 */
@Entity
@Table(name = "payg_team_extensions")
@NoArgsConstructor
@Getter
@Setter
public class PaygTeamExtensions implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "team_id")
    private Long teamId;

    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "team_id")
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Team team;

    /** Per-team policy override; NULL means use the default row in {@code pricing_policy}. */
    @Column(name = "pricing_policy_id")
    private Long pricingPolicyId;

    /** Stripe customer id for this team. Eager-created so every team has billing identity. */
    @Column(name = "stripe_customer_id", unique = true, length = 128)
    private String stripeCustomerId;

    /**
     * Stripe subscription id (sub_xxx) for this team's PAYG metered subscription. {@code null}
     * means the team has not added a card yet — engine writes shadow rows only and free-tier gating
     * applies. {@code non-null} means engine posts meter events to Stripe on every billable tool
     * call.
     *
     * <p>This is the single switch that determines whether a team is billed. Mutated only by the
     * {@code payg_link_subscription} / {@code payg_unlink_subscription} Postgres functions (V14) —
     * never directly via JPA writes. Treat as read-only from Java.
     */
    @Column(name = "payg_subscription_id", unique = true, length = 128)
    private String paygSubscriptionId;

    /**
     * Remaining one-time free documents for this team (the lifetime grant). Seeded from the
     * effective pricing policy's {@code free_tier_units} when this row is created (V14 trigger,
     * updated in V19); decremented by the charge pipeline when a billable charge is written and
     * restored on a first-step refund. Never replenishes; survives subscribing. This counter — not
     * the wallet ledger — is the source of truth for the grant, so old ledger rows can be pruned.
     */
    @Column(name = "free_units_remaining", nullable = false)
    private Long freeUnitsRemaining = 0L;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Version
    @Column(name = "version")
    private Long version;

    public PaygTeamExtensions(Team team) {
        this.team = team;
        this.teamId = team.getId();
    }
}
