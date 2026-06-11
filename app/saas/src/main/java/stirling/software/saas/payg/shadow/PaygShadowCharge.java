package stirling.software.saas.payg.shadow;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.ShadowChargeStatus;

/**
 * Per-job comparison row written while a team is in {@code PAYG_SHADOW} mode: what the legacy
 * engine actually charged vs. what the PAYG engine would have charged. Aggregated daily by the
 * shadow-reconciliation report; deletable after promotion.
 *
 * <p>The {@link #status} column mirrors the eventual Stripe meter_event_adjustment(cancel) flow:
 * rows are written {@code CHARGED}; a freshly-opened process whose first step 5xx's is flipped to
 * {@code REFUNDED} in the same request's {@code afterCompletion}.
 */
@Entity
@Table(name = "payg_shadow_charge")
@NoArgsConstructor
@Getter
@Setter
public class PaygShadowCharge implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "shadow_id")
    private Long id;

    @Column(name = "team_id", nullable = false)
    private Long teamId;

    @Column(name = "job_id", nullable = false)
    private UUID jobId;

    @Column(name = "policy_id", nullable = false)
    private Long policyId;

    @Column(name = "payg_units", nullable = false)
    private Integer paygUnits;

    /**
     * How many of {@link #paygUnits} were drawn from the team's one-time free grant at charge time.
     * The paid (Stripe-metered) portion is {@code paygUnits - freeUnitsConsumed}; a refund restores
     * this many units to {@code payg_team_extensions.free_units_remaining}. {@code 0} for pre-V19
     * rows and for jobs that consumed no free units (team's grant already exhausted).
     */
    @Column(name = "free_units_consumed", nullable = false)
    private Integer freeUnitsConsumed = 0;

    @Column(name = "legacy_credits_charged", nullable = false)
    private Integer legacyCreditsCharged;

    /** Signed percent difference: {@code 100 * (payg - legacy) / max(1, legacy)}. */
    @Column(name = "diff_pct", nullable = false)
    private Integer diffPct;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private ShadowChargeStatus status = ShadowChargeStatus.CHARGED;

    /** Set when {@link #status} flips to {@link ShadowChargeStatus#REFUNDED}. */
    @Column(name = "refunded_at")
    private LocalDateTime refundedAt;

    /** Free-form reason, e.g. {@code "first-step-5xx:503"}. */
    @Column(name = "refund_reason", length = 128)
    private String refundReason;

    /**
     * PAYG analytics axis copied from the request that produced this shadow row. {@code null} for
     * pre-V16 rows; populated by the charge interceptor going forward. Never affects what Stripe
     * would meter — the flat-meter assumption holds, this is breakdown metadata.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "billing_category", length = 16)
    private BillingCategory billingCategory;

    /**
     * Caller surface that originated the job (copied from {@code processing_job.source} at write
     * time so the row stays self-describing after the job table is pruned). {@code null} for
     * pre-V16 rows backfilled when {@code processing_job} is no longer present.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "job_source", length = 32)
    private JobSource jobSource;

    @CreationTimestamp
    @Column(name = "occurred_at", nullable = false, updatable = false)
    private LocalDateTime occurredAt;
}
