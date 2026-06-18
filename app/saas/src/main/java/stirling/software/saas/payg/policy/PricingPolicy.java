package stirling.software.saas.payg.policy;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapKeyColumn;
import jakarta.persistence.MapKeyEnumerated;
import jakarta.persistence.Table;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.saas.payg.model.JobSource;

/**
 * Versioned pricing policy. Unit-calculation knobs, per-source step limits, and the per-currency
 * Stripe price IDs that turn doc-units into invoice amounts. Money lives in Stripe; this row
 * carries everything else.
 */
@Entity
@Table(name = "pricing_policy")
@NoArgsConstructor
@AllArgsConstructor
@Getter
@Setter
public class PricingPolicy implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "policy_id")
    private Long id;

    /** Human-readable version label, e.g. {@code v1-2026-06}. Unique across all policies. */
    @Column(name = "version", nullable = false, unique = true, length = 32)
    private String version;

    @Column(name = "effective_from", nullable = false)
    private LocalDateTime effectiveFrom;

    /** Null while the policy is the current one in its lineage. */
    @Column(name = "effective_to")
    private LocalDateTime effectiveTo;

    @Column(name = "doc_pages_per_unit", nullable = false)
    private Integer docPagesPerUnit;

    @Column(name = "doc_bytes_per_unit", nullable = false)
    private Long docBytesPerUnit;

    @Column(name = "min_charge_units", nullable = false)
    private Integer minChargeUnits = 1;

    @Column(name = "file_unit_cap", nullable = false)
    private Integer fileUnitCap = 1000;

    /**
     * One-time lifetime free document grant handed to a team on creation. {@code 0} (default) means
     * no free grant. NOT per-cycle: it never replenishes and a team keeps any unused portion after
     * subscribing. The value is copied into {@code payg_team_extensions.free_units_remaining} when
     * the team's sidecar row is created (V14 trigger, updated in V19); from then on the per-team
     * counter is authoritative and this column is only the seed for new teams.
     */
    @Column(name = "free_tier_units", nullable = false)
    private Long freeTierUnits = 0L;

    /**
     * Max tool steps allowed in one process before it splits, keyed by the caller's {@link
     * JobSource}. Self-hosted teams typically get a higher limit via a per-team policy override.
     *
     * <p>Persisted as a normalized child table {@code pricing_policy_step_limit (policy_id,
     * job_source, step_limit)} rather than JSONB — values are typed and queryable directly.
     */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "pricing_policy_step_limit",
            joinColumns = @JoinColumn(name = "policy_id"))
    @MapKeyEnumerated(EnumType.STRING)
    @MapKeyColumn(name = "job_source", length = 32)
    @Column(name = "step_limit", nullable = false)
    private Map<JobSource, Integer> stepLimits = new HashMap<>();

    /**
     * Stripe Price IDs this policy resolves to — one per currency we support. Currency is not
     * stored here; it comes from {@code stripe.prices.currency} via Sync Engine when picking the
     * right Price for a customer's subscription. All prices must share the same Billing Meter and
     * the same free-tier upper bound in units (enforced by a deploy-time CI check).
     *
     * <p>Persisted as {@code pricing_policy_stripe_price (policy_id, stripe_price_id)}.
     */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "pricing_policy_stripe_price",
            joinColumns = @JoinColumn(name = "policy_id"))
    @Column(name = "stripe_price_id", nullable = false, length = 128)
    private Set<String> stripePriceIds = new HashSet<>();

    /**
     * Exactly one row in the table has {@code is_default = true}; enforced by partial unique idx.
     */
    @Column(name = "is_default", nullable = false)
    private Boolean isDefault = false;

    @Column(name = "notes", columnDefinition = "text")
    private String notes;

    @Column(name = "created_by", length = 255)
    private String createdBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Convenience ctor for the unit-calc-only fields used by the document classifier and tests.
     * Other fields are filled with sensible defaults; persistence callers should set the rest
     * before saving.
     */
    public PricingPolicy(
            int docPagesPerUnit, long docBytesPerUnit, int minChargeUnits, int fileUnitCap) {
        if (docPagesPerUnit <= 0) {
            throw new IllegalArgumentException("docPagesPerUnit must be > 0");
        }
        if (docBytesPerUnit <= 0) {
            throw new IllegalArgumentException("docBytesPerUnit must be > 0");
        }
        if (minChargeUnits < 1) {
            throw new IllegalArgumentException("minChargeUnits must be >= 1");
        }
        if (fileUnitCap < 1) {
            throw new IllegalArgumentException("fileUnitCap must be >= 1");
        }
        this.docPagesPerUnit = docPagesPerUnit;
        this.docBytesPerUnit = docBytesPerUnit;
        this.minChargeUnits = minChargeUnits;
        this.fileUnitCap = fileUnitCap;
    }
}
