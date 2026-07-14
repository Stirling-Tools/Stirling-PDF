package stirling.software.saas.payg.bundle;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Objects;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.billing.TeamBillingContext;
import stirling.software.saas.payg.billing.TeamBillingService;

/**
 * The purchase side of prepaid bundles: turns a leader's requested capacity into a persisted,
 * server-priced quote ticket ({@link PrepaidBundleQuote}) the checkout edge function can act on.
 * Consumption lives in {@link PrepaidBundleService}; this class never touches Stripe.
 *
 * <p><b>Pricing.</b> Money lives in Stripe, so the actual charge is {@code units × <one-time Price
 * unit_amount> × <coupon>} computed by Stripe at checkout. The per-unit rate is the SAME one the
 * meter bills at, so this service reuses the team's resolved rate ({@link
 * TeamBillingContext#perDocMinor()}) only to show the buyer the figure they'll pay — an estimate,
 * not the authority. The "12 months for the price of 10" benefit is {@code MONTHS_PAID /
 * MONTHS_GRANTED}; the Stripe coupon must be configured to the matching percentage (the buyer sees
 * a penny-exact estimate here, Stripe's coupon rounding is authoritative).
 *
 * <p>The requested capacity is the buyer's order size, priced per-unit by Stripe, so it is not an
 * exploit surface — we only guard against nonsense/overflow. The ticket is the record that a leader
 * authorized this quantity; it lapses after {@link #QUOTE_TTL} if never paid.
 */
@Slf4j
@Service
@Profile("saas")
public class PrepaidPurchaseService {

    /** Capacity term granted by one bundle. */
    static final int MONTHS_GRANTED = 12;

    /** Months actually paid for — the "12 for the price of 10" discount. */
    static final int MONTHS_PAID = 10;

    /** How long a quote ticket is valid before the buyer must re-quote. */
    static final Duration QUOTE_TTL = Duration.ofMinutes(30);

    /**
     * Sanity bounds on the requested capacity — an overflow/nonsense guard only. Real purchase-size
     * UX limits (recommended tiers, minimums) are a product/front-end concern, not enforced here.
     */
    static final long MIN_UNITS = 1L;

    static final long MAX_UNITS = 1_000_000_000L;

    /** The app prices in dollars when a team has no Stripe currency yet (free, pre-checkout). */
    private static final String FALLBACK_CURRENCY = "usd";

    private final PrepaidBundleQuoteRepository quoteRepository;
    private final TeamBillingService billingService;

    public PrepaidPurchaseService(
            PrepaidBundleQuoteRepository quoteRepository, TeamBillingService billingService) {
        this.quoteRepository = Objects.requireNonNull(quoteRepository, "quoteRepository");
        this.billingService = Objects.requireNonNull(billingService, "billingService");
    }

    /**
     * Price + persist a quote for {@code requestedUnits} of prepaid capacity for {@code teamId}.
     * The money figures are null when the per-unit rate can't be resolved (free team before the
     * Price has synced) — the ticket is still valid because the edge fn prices the checkout from
     * Stripe; the front end falls back to its own wallet rate for display.
     *
     * @throws IllegalArgumentException when the requested capacity is outside {@link
     *     #MIN_UNITS}..{@link #MAX_UNITS}
     */
    @Transactional
    public PrepaidQuote quote(Long teamId, long requestedUnits) {
        Objects.requireNonNull(teamId, "teamId");
        if (requestedUnits < MIN_UNITS || requestedUnits > MAX_UNITS) {
            throw new IllegalArgumentException(
                    "requested units out of range: "
                            + requestedUnits
                            + " (allowed "
                            + MIN_UNITS
                            + ".."
                            + MAX_UNITS
                            + ")");
        }

        TeamBillingContext billing = billingService.forTeam(teamId);
        String currency = billing.currency() != null ? billing.currency() : FALLBACK_CURRENCY;
        BigDecimal rate = billing.perDocMinor();

        Long listMinor = null;
        Long totalMinor = null;
        Long savingsMinor = null;
        if (rate != null && rate.signum() > 0) {
            BigDecimal units = BigDecimal.valueOf(requestedUnits);
            // Undiscounted "worth" and the discounted price the buyer pays. Rounded independently
            // to
            // the minor unit; savings is the difference so the three figures stay self-consistent.
            listMinor = rate.multiply(units).setScale(0, RoundingMode.HALF_UP).longValue();
            totalMinor =
                    rate.multiply(units)
                            .multiply(BigDecimal.valueOf(MONTHS_PAID))
                            .divide(BigDecimal.valueOf(MONTHS_GRANTED), 0, RoundingMode.HALF_UP)
                            .longValue();
            savingsMinor = listMinor - totalMinor;
        }

        LocalDateTime expiresAt = LocalDateTime.now().plus(QUOTE_TTL);
        PrepaidBundleQuote saved =
                quoteRepository.save(
                        new PrepaidBundleQuote(teamId, requestedUnits, currency, expiresAt));

        return new PrepaidQuote(
                saved.getId(),
                requestedUnits,
                currency,
                rate,
                listMinor,
                totalMinor,
                savingsMinor,
                MONTHS_GRANTED,
                MONTHS_PAID,
                expiresAt);
    }

    /**
     * A priced bundle quote. Money figures are in minor units of {@link #currency} and null when
     * the rate is unknown; {@link #unitAmountMinor} may be fractional (sub-cent per-unit rates).
     */
    public record PrepaidQuote(
            long quoteId,
            long units,
            String currency,
            BigDecimal unitAmountMinor,
            Long listAmountMinor,
            Long totalAmountMinor,
            Long savingsMinor,
            int monthsGranted,
            int monthsPaid,
            LocalDateTime expiresAt) {}
}
