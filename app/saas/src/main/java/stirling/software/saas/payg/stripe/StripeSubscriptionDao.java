package stirling.software.saas.payg.stripe;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import lombok.extern.slf4j.Slf4j;

/**
 * Read-only accessor for the Stripe Sync Engine schema ({@code stripe.*}). Gives the PAYG layer the
 * team's real billing window and the per-document rate of the Price its subscription bills against
 * — both live in Stripe, mirrored into Postgres by the sync engine, and are NOT duplicated in
 * {@code stirling_pdf} (design §10: money lives in Stripe).
 *
 * <p>PAYG prices are plain {@code per_unit} metered prices, so {@code stripe.prices.unit_amount}
 * carries the rate directly. The free allowance is deliberately NOT in Stripe — it's {@code
 * pricing_policy.free_tier_units_per_cycle}, applied app-side (free units are never metered),
 * because un-subscribed teams get the same allowance and have no Stripe Price at all.
 *
 * <p>Defensive by construction: the {@code stripe} schema only exists where the sync engine has run
 * (dev + prod Supabase, not unit-test H2). Any {@link DataAccessException} — missing schema,
 * missing row, connectivity blip — degrades to {@link Optional#empty()} with a WARN so callers fall
 * back to calendar-month windows rather than 500ing the wallet endpoint.
 */
@Slf4j
@Repository
@Profile("saas")
public class StripeSubscriptionDao {

    /**
     * Billing window + per-document rate of one subscription. Epoch seconds come back from sync
     * engine as INTEGER columns; converted to {@link LocalDateTime} in the system zone so they
     * compare cleanly against {@code wallet_ledger.occurred_at} (written by
     * {@code @CreationTimestamp} with JVM-local semantics).
     *
     * @param priceId the Stripe Price the subscription's (sole) item bills against; null if the
     *     item row hasn't synced yet
     * @param currency lower-case ISO 4217 of that Price; null when the price row is missing
     * @param perDocMinor per-document rate in minor units (may be fractional via {@code
     *     unit_amount_decimal}); null when the price row is missing or carries no usable amount
     *     (e.g. a tiered price, which PAYG doesn't use)
     */
    public record SubscriptionBilling(
            LocalDateTime periodStart,
            LocalDateTime periodEnd,
            String priceId,
            String status,
            String currency,
            BigDecimal perDocMinor) {}

    private static final String QUERY =
            "SELECT s.current_period_start, s.current_period_end, s.status::text AS status,"
                    + " p.id AS price_id, p.currency AS currency,"
                    + " p.unit_amount AS unit_amount, p.unit_amount_decimal AS unit_amount_decimal"
                    + " FROM stripe.subscriptions s"
                    + " LEFT JOIN LATERAL ("
                    + "   SELECT si.price FROM stripe.subscription_items si"
                    + "   WHERE si.subscription = s.id AND COALESCE(si.deleted, false) = false"
                    + "   ORDER BY si.created DESC NULLS LAST LIMIT 1"
                    + " ) item ON true"
                    + " LEFT JOIN stripe.prices p ON p.id = item.price"
                    + " WHERE s.id = ?";

    private final JdbcTemplate jdbcTemplate;

    public StripeSubscriptionDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
    }

    /** Billing window + rate for {@code subscriptionId}; empty if unsynced or schema absent. */
    public Optional<SubscriptionBilling> findBilling(String subscriptionId) {
        if (subscriptionId == null || subscriptionId.isBlank()) {
            return Optional.empty();
        }
        try {
            List<SubscriptionBilling> rows =
                    jdbcTemplate.query(
                            QUERY,
                            (rs, i) -> {
                                long startEpoch = rs.getLong("current_period_start");
                                boolean startNull = rs.wasNull();
                                long endEpoch = rs.getLong("current_period_end");
                                boolean endNull = rs.wasNull();
                                if (startNull || endNull) {
                                    return null;
                                }
                                // Prefer the decimal column (sub-minor-unit precision, e.g.
                                // half-cent per-document rates); fall back to the integer one.
                                BigDecimal rate = null;
                                String decimal = rs.getString("unit_amount_decimal");
                                if (decimal != null && !decimal.isBlank()) {
                                    try {
                                        rate = new BigDecimal(decimal);
                                    } catch (NumberFormatException ignore) {
                                        rate = null;
                                    }
                                }
                                if (rate == null) {
                                    long unitAmount = rs.getLong("unit_amount");
                                    if (!rs.wasNull()) {
                                        rate = BigDecimal.valueOf(unitAmount);
                                    }
                                }
                                if (rate != null && rate.signum() <= 0) {
                                    rate = null;
                                }
                                return new SubscriptionBilling(
                                        toLocal(startEpoch),
                                        toLocal(endEpoch),
                                        rs.getString("price_id"),
                                        rs.getString("status"),
                                        rs.getString("currency"),
                                        rate);
                            },
                            subscriptionId);
            return rows.stream().filter(Objects::nonNull).findFirst();
        } catch (DataAccessException e) {
            // Missing stripe schema (sync engine not provisioned) or transient DB issue. The
            // caller falls back to a calendar-month window; usage still accrues correctly.
            log.warn(
                    "stripe.subscriptions lookup failed for {}: {}",
                    subscriptionId,
                    e.getMessage());
            return Optional.empty();
        }
    }

    private static LocalDateTime toLocal(long epochSeconds) {
        return LocalDateTime.ofInstant(Instant.ofEpochSecond(epochSeconds), ZoneId.systemDefault());
    }
}
