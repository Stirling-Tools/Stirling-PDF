package stirling.software.saas.payg.bundle;

import java.io.Serializable;
import java.time.LocalDateTime;

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
 * A short-lived, leader-authorized prepaid-bundle purchase ticket. Written by {@code POST
 * /api/v1/payg/bundle/quote} once the caller has been verified as a team leader; read once by the
 * create-payg-bundle-checkout edge function, which turns it into a Stripe Checkout Session.
 *
 * <p>Carries only the capacity ({@link #units}) + {@link #currency} the leader committed to — the
 * per-unit price and the "12 months for the price of 10" discount live in Stripe (a one-time Price
 * at the same unit_amount as the meter + a coupon). The ticket is not a billing record; the {@link
 * PrepaidBundle} pool opened on webhook is. An unused ticket simply lapses at {@link #expiresAt}
 * and is inert thereafter — the edge fn refuses an expired ticket.
 */
@Entity
@Table(name = "payg_bundle_quote")
@NoArgsConstructor
@Getter
@Setter
public class PrepaidBundleQuote implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "quote_id")
    private Long id;

    @Column(name = "team_id", nullable = false)
    private Long teamId;

    /**
     * Capacity the leader chose to buy — the 12-month pool size. Stripe bills this as the line
     * quantity.
     */
    @Column(name = "units", nullable = false)
    private long units;

    /** Lower-case ISO 4217 the checkout Price is denominated in. */
    @Column(name = "currency", nullable = false, length = 8)
    private String currency;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /** Ticket validity — a checkout started after this instant is rejected. */
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    /**
     * When the leader affirmatively consented (ARL/EULA §7.2) to the prepaid→metered
     * auto-transition, captured at quote time before payment. NULL = no consent; the checkout edge
     * fn refuses the session. {@link #eulaVersion} + {@link #priceMinor} record exactly what was
     * disclosed.
     */
    @Column(name = "consented_at")
    private LocalDateTime consentedAt;

    /** EULA version string shown at consent — proof of the agreed terms. */
    @Column(name = "eula_version", length = 32)
    private String eulaVersion;

    /**
     * One-time price disclosed at consent (minor units of {@link #currency}); null when rate
     * unknown.
     */
    @Column(name = "price_minor")
    private Long priceMinor;

    public PrepaidBundleQuote(Long teamId, long units, String currency, LocalDateTime expiresAt) {
        this.teamId = teamId;
        this.units = units;
        this.currency = currency;
        this.expiresAt = expiresAt;
    }
}
