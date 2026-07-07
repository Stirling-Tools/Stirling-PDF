package stirling.software.saas.procurement.model;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A priced, itemised offer built against a {@link ProcurementDeal}. The config columns are the
 * buyer's choices; {@code annualNetMinor}/{@code tcvMinor} and {@code lineItemsJson} are the
 * server-computed result (never trusted from the client). Stripe fields are populated when the
 * accepted quote is turned into a checkout.
 */
@Entity
@Table(name = "procurement_quote")
@NoArgsConstructor
@Getter
@Setter
public class ProcurementQuote implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String STATUS_DRAFT = "draft";
    public static final String STATUS_SENT = "sent";
    public static final String STATUS_ACCEPTED = "accepted";
    public static final String STATUS_EXPIRED = "expired";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "quote_id")
    private Long quoteId;

    @Column(name = "deal_id", nullable = false)
    private Long dealId;

    @Column(name = "quote_number", nullable = false, length = 64)
    private String quoteNumber;

    @Column(name = "status", nullable = false, length = 24)
    private String status = STATUS_DRAFT;

    @Column(name = "currency", nullable = false, length = 8)
    private String currency = "USD";

    @Column(name = "volume", nullable = false)
    private long volume;

    @Column(name = "seats")
    private Integer seats;

    @Column(name = "deployment", length = 24)
    private String deployment;

    @Column(name = "term_years", nullable = false)
    private int termYears;

    @Column(name = "service_level", nullable = false, length = 24)
    private String serviceLevel;

    @Column(name = "indemnification", nullable = false)
    private boolean indemnification;

    @Column(name = "training", nullable = false)
    private boolean training;

    @Column(name = "qbr", nullable = false)
    private boolean qbr;

    @Column(name = "annual_net_minor", nullable = false)
    private long annualNetMinor;

    @Column(name = "tcv_minor", nullable = false)
    private long tcvMinor;

    @Column(name = "line_items", columnDefinition = "text")
    private String lineItemsJson;

    // The Stripe Quote this was issued as (finalized → has a number + PDF). Set by the edge fn.
    @Column(name = "stripe_quote_id", length = 128)
    private String stripeQuoteId;

    // Hosted Stripe invoice URL for the subscription's first invoice, set once the quote is
    // accepted.
    @Column(name = "stripe_invoice_url", columnDefinition = "text")
    private String stripeInvoiceUrl;

    // Buyer's company name (shown on the quote/agreement); echoed back so an edit remembers it.
    @Column(name = "business_name", length = 255)
    private String businessName;

    @Column(name = "valid_until")
    private LocalDate validUntil;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;
}
