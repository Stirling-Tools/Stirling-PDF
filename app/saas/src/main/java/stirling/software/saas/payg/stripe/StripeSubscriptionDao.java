package stirling.software.saas.payg.stripe;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
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
 * - both live in Stripe, mirrored into Postgres by the sync engine, and are NOT duplicated in
 * {@code stirling_pdf} (money lives in Stripe).
 *
 * <p>PAYG prices are plain {@code per_unit} metered prices, so {@code stripe.prices.unit_amount}
 * carries the rate directly. The free grant is deliberately NOT in Stripe - it's the one-time
 * {@code pricing_policy.free_tier_units} pool, applied app-side (free units are never metered),
 * because un-subscribed teams get the same grant and have no Stripe Price at all.
 *
 * <p>Defensive by construction: the {@code stripe} schema only exists where the sync engine has run
 * (dev + prod Supabase, not unit-test H2). Any {@link DataAccessException} - missing schema,
 * missing row, connectivity blip - degrades to {@link Optional#empty()} with a WARN so callers fall
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

    /**
     * The per-document rate of a Price looked up directly (not via a subscription) - used to price
     * the cap estimate for un-subscribed teams, whose default policy points at Stripe Prices that
     * carry the same {@code unit_amount} they'd be billed at on subscribing.
     *
     * @param priceId the resolved Stripe Price id
     * @param currency lower-case ISO 4217 of that Price
     * @param perDocMinor per-document rate in minor units (may be fractional); never null - a row
     *     with no usable amount is filtered out rather than returned with a null rate
     */
    public record PriceRate(String priceId, String currency, BigDecimal perDocMinor) {}

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
                                return new SubscriptionBilling(
                                        toLocal(startEpoch),
                                        toLocal(endEpoch),
                                        rs.getString("price_id"),
                                        rs.getString("status"),
                                        rs.getString("currency"),
                                        extractRate(rs));
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

    /**
     * Per-document rate of the active {@code stripe.prices} row with the given {@code lookupKey} in
     * {@code currency} - the elegant mirror of {@link #findBilling}, reading the same synced table
     * by Stripe Price {@code lookup_key} instead of via a subscription. The PAYG layer uses this to
     * price the cap estimate for an un-subscribed team: there's no subscription to read a rate off,
     * but the PAYG Price (lookup key {@code plan:processor}) carries the very rate they'd be billed
     * at. We resolve by lookup_key rather than the default policy's price ids because those aren't
     * seeded - the lookup key is the stable, env-agnostic handle (same one the price-lookup edge
     * function uses).
     *
     * <p>Empty when the {@code stripe} schema is absent (H2 unit tests), no active matching row
     * exists, or the row carries no usable per-unit amount (e.g. a tiered price, which PAYG doesn't
     * use). Callers degrade to "no estimate" exactly as the subscribed path degrades to a
     * calendar-month window.
     */
    public Optional<PriceRate> findRateByLookupKey(String lookupKey, String currency) {
        if (lookupKey == null || lookupKey.isBlank() || currency == null || currency.isBlank()) {
            return Optional.empty();
        }
        String sql =
                "SELECT p.id AS price_id, p.currency AS currency,"
                        + " p.unit_amount AS unit_amount,"
                        + " p.unit_amount_decimal AS unit_amount_decimal"
                        + " FROM stripe.prices p"
                        + " WHERE p.lookup_key = ? AND p.currency = ?"
                        + " AND COALESCE(p.active, true) = true"
                        + " ORDER BY p.created DESC NULLS LAST LIMIT 1";
        try {
            List<PriceRate> rows =
                    jdbcTemplate.query(
                            sql,
                            (rs, i) -> {
                                BigDecimal rate = extractRate(rs);
                                if (rate == null) {
                                    return null;
                                }
                                return new PriceRate(
                                        rs.getString("price_id"), rs.getString("currency"), rate);
                            },
                            lookupKey,
                            currency.toLowerCase());
            return rows.stream().filter(Objects::nonNull).findFirst();
        } catch (DataAccessException e) {
            log.warn(
                    "stripe.prices rate lookup failed for lookup_key {} / currency {}: {}",
                    lookupKey,
                    currency,
                    e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Reads the per-document rate off a {@code stripe.prices} row. Prefers {@code
     * unit_amount_decimal} (sub-minor-unit precision, e.g. half-cent rates), falls back to the
     * integer {@code unit_amount}, and returns null when neither is usable or the amount is ≤ 0
     * (tiered/zero prices PAYG doesn't bill on). Both queries alias the columns identically so this
     * is shared verbatim.
     */
    private static BigDecimal extractRate(ResultSet rs) throws SQLException {
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
        return rate;
    }

    private static LocalDateTime toLocal(long epochSeconds) {
        return LocalDateTime.ofInstant(Instant.ofEpochSecond(epochSeconds), ZoneId.systemDefault());
    }
}
