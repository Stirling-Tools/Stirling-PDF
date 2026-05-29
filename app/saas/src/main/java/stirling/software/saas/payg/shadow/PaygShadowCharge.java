package stirling.software.saas.payg.shadow;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Per-job comparison row written while a team is in {@code PAYG_SHADOW} mode: what the legacy
 * engine actually charged vs. what the PAYG engine would have charged. Aggregated daily by the
 * shadow-reconciliation report; deletable after promotion.
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

    @Column(name = "legacy_credits_charged", nullable = false)
    private Integer legacyCreditsCharged;

    /** Signed percent difference: {@code 100 * (payg - legacy) / max(1, legacy)}. */
    @Column(name = "diff_pct", nullable = false)
    private Integer diffPct;

    @CreationTimestamp
    @Column(name = "occurred_at", nullable = false, updatable = false)
    private LocalDateTime occurredAt;
}
