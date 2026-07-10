package stirling.software.saas.payg.wallet;

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
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.LedgerBucket;
import stirling.software.saas.payg.model.LedgerEntryType;
import stirling.software.saas.payg.model.ReferenceType;

/**
 * Append-only ledger keyed on {@code team_id}. {@code amount_units} is signed (positive = credit,
 * negative = debit). Two unique indexes (reference triple, stripe event id) prevent double-posting.
 */
@Entity
@Table(name = "wallet_ledger")
@NoArgsConstructor
@Getter
@Setter
public class WalletLedgerEntry implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "entry_id")
    private Long id;

    @Column(name = "team_id", nullable = false)
    private Long teamId;

    /** Which team member triggered this entry; null for system grants. */
    @Column(name = "actor_user_id")
    private Long actorUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "entry_type", nullable = false, length = 32)
    private LedgerEntryType entryType;

    @Enumerated(EnumType.STRING)
    @Column(name = "bucket", nullable = false, length = 16)
    private LedgerBucket bucket;

    /** Signed: positive = credit, negative = debit. The only quantity the app tracks. */
    @Column(name = "amount_units", nullable = false)
    private Integer amountUnits;

    @Enumerated(EnumType.STRING)
    @Column(name = "reference_type", nullable = false, length = 32)
    private ReferenceType referenceType;

    @Column(name = "reference_id", nullable = false, length = 128)
    private String referenceId;

    @Column(name = "policy_id")
    private Long policyId;

    /**
     * Number of input files this entry billed (the count dimension, distinct from size-scaled
     * {@link #amountUnits}). Denormalised from {@code processing_job.doc_count} so usage analytics
     * — "PDFs processed" — sum one table. Defaults to 1; system/aggregate entries may leave it 1.
     */
    @Column(name = "doc_count", nullable = false)
    private Integer docCount = 1;

    /**
     * SHA-256 of this entry's input file set; {@code COUNT(DISTINCT ...)} over a period gives
     * unique PDFs processed. {@code null} for aggregate/system entries (grants, linked-instance
     * sync) that don't map to a single document set.
     */
    @Column(name = "document_fingerprint", length = 64)
    private String documentFingerprint;

    @Column(name = "stripe_event_id", length = 128)
    private String stripeEventId;

    /**
     * PAYG analytics axis. {@code null} for system entries (grants, resets) and pre-V16 rows; set
     * by the charge interceptor for billable debits. Stripe pricing never reads this — it's a
     * single flat meter — so the column stays soft-typed (no NOT NULL, no FK).
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "billing_category", length = 16)
    private BillingCategory billingCategory;

    @CreationTimestamp
    @Column(name = "occurred_at", nullable = false, updatable = false)
    private LocalDateTime occurredAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metadata", columnDefinition = "jsonb")
    private Map<String, Object> metadata = new HashMap<>();
}
