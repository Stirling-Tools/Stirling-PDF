package stirling.software.saas.payg.policy;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
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
     * Max tool steps allowed in one process before it splits, keyed by the caller's {@link
     * JobSource}. Self-hosted (DESKTOP) typically gets a higher limit than WEB or API.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "step_limits", columnDefinition = "jsonb", nullable = false)
    @Enumerated(EnumType.STRING)
    @MapKeyEnumerated(EnumType.STRING)
    private Map<JobSource, Integer> stepLimits = new HashMap<>();

    /**
     * Per-currency Stripe Price IDs (ISO 4217 code → price ID). All prices in this map must share
     * the same Billing Meter and the same free-tier upper bound in units. A deploy-time check
     * enforces that consistency.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "stripe_price_ids", columnDefinition = "jsonb", nullable = false)
    private Map<String, String> stripePriceIds = new HashMap<>();

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
