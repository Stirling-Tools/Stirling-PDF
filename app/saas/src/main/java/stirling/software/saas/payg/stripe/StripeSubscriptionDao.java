package stirling.software.saas.payg.stripe;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Objects;
import java.util.Optional;

import javax.sql.DataSource;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

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
 * (dev + prod Supabase, not unit-test H2). Any {@link SQLException} - missing schema, missing row,
 * connectivity blip - degrades to {@link Optional#empty()} with a WARN so callers fall back to
 * calendar-month windows rather than 500ing the wallet endpoint.
 */
@Slf4j
@ApplicationScoped
@IfBuildProfile("saas")
public class StripeSubscriptionDao {

    /**
     * Billing window + per-document rate of one subscription. Epoch seconds come back from sync
     * engine as INTEGER columns; converted to {@link LocalDateTime} in the system zone so they
     * compare cleanly against {@code wallet_ledger.occurred_at}.
     *
     * @param priceId the Stripe Price the subscription's (sole) item bills against; null if the
     *     item row hasn't synced yet
     * @param currency lower-case ISO 4217 of that Price; null when the price row is missing
     * @param perDocMinor per-document rate in minor units (may be fractional via {@code
     *     unit_amount_decimal}); null when the price row is missing or carries no usable amount
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
     * the cap estimate for un-subscribed teams.
     *
     * @param priceId the resolved Stripe Price id
     * @param currency lower-case ISO 4217 of that Price
     * @param perDocMinor per-document rate in minor units (may be fractional); never null
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

    private final DataSource dataSource;

    @Inject
    public StripeSubscriptionDao(DataSource dataSource) {
        this.dataSource = Objects.requireNonNull(dataSource, "dataSource");
    }

    /** Billing window + rate for {@code subscriptionId}; empty if unsynced or schema absent. */
    public Optional<SubscriptionBilling> findBilling(String subscriptionId) {
        if (subscriptionId == null || subscriptionId.isBlank()) {
            return Optional.empty();
        }
        try (Connection conn = dataSource.getConnection();
                PreparedStatement ps = conn.prepareStatement(QUERY)) {
            ps.setString(1, subscriptionId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    long startEpoch = rs.getLong("current_period_start");
                    boolean startNull = rs.wasNull();
                    long endEpoch = rs.getLong("current_period_end");
                    boolean endNull = rs.wasNull();
                    if (startNull || endNull) {
                        continue;
                    }
                    return Optional.of(
                            new SubscriptionBilling(
                                    toLocal(startEpoch),
                                    toLocal(endEpoch),
                                    rs.getString("price_id"),
                                    rs.getString("status"),
                                    rs.getString("currency"),
                                    extractRate(rs)));
                }
            }
            return Optional.empty();
        } catch (SQLException e) {
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
     * {@code currency}. The PAYG layer uses this to price the cap estimate for an un-subscribed
     * team. Empty when the {@code stripe} schema is absent, no active matching row exists, or the
     * row carries no usable per-unit amount.
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
        try (Connection conn = dataSource.getConnection();
                PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, lookupKey);
            ps.setString(2, currency.toLowerCase());
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    BigDecimal rate = extractRate(rs);
                    if (rate == null) {
                        continue;
                    }
                    return Optional.of(
                            new PriceRate(
                                    rs.getString("price_id"), rs.getString("currency"), rate));
                }
            }
            return Optional.empty();
        } catch (SQLException e) {
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
     * unit_amount_decimal} (sub-minor-unit precision), falls back to the integer {@code
     * unit_amount}, and returns null when neither is usable or the amount is ≤ 0.
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
