package stirling.software.saas.payg.stripe;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import lombok.extern.slf4j.Slf4j;

/**
 * Read-only accessor for a team's default card off the Stripe Sync Engine schema ({@code
 * stripe.payment_methods}). Prefers the customer's {@code invoice_settings.default_payment_method};
 * falls back to their most recently created card. Card details (brand / last4 / expiry) live in the
 * {@code card} JSONB column the sync engine mirrors.
 *
 * <p>Same defensive posture as {@link StripeInvoiceDao}/{@link StripeSubscriptionDao}: a missing
 * schema or table — H2 unit tests, sync engine not provisioned, or {@code payment_methods} simply
 * absent from the sync target list — degrades to {@link Optional#empty()} with a WARN, so the
 * endpoint reports "no card on file" rather than 500ing the page. Editing always happens in
 * Stripe's hosted portal; this never writes.
 */
@Slf4j
@Repository
@Profile("saas")
public class StripePaymentMethodDao {

    /** Card brand (e.g. "visa"), last 4 digits, and numeric expiry; any field may be null. */
    public record CardSummary(String brand, String last4, Integer expMonth, Integer expYear) {}

    private static final String QUERY =
            "SELECT pm.card->>'brand' AS brand, pm.card->>'last4' AS last4,"
                    + " pm.card->>'exp_month' AS exp_month, pm.card->>'exp_year' AS exp_year"
                    + " FROM stripe.payment_methods pm"
                    + " WHERE pm.customer = ? AND pm.type = 'card'"
                    + " ORDER BY (pm.id = ("
                    + "   SELECT c.invoice_settings->>'default_payment_method'"
                    + "   FROM stripe.customers c WHERE c.id = ?"
                    + " )) DESC NULLS LAST, pm.created DESC NULLS LAST"
                    + " LIMIT 1";

    private final JdbcTemplate jdbcTemplate;

    public StripePaymentMethodDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
    }

    /** The customer's default card; empty on missing schema / no card / connectivity blip. */
    public Optional<CardSummary> findDefaultCard(String stripeCustomerId) {
        if (stripeCustomerId == null || stripeCustomerId.isBlank()) {
            return Optional.empty();
        }
        try {
            List<CardSummary> rows =
                    jdbcTemplate.query(
                            QUERY,
                            (rs, i) ->
                                    new CardSummary(
                                            rs.getString("brand"),
                                            rs.getString("last4"),
                                            parseIntOrNull(rs, "exp_month"),
                                            parseIntOrNull(rs, "exp_year")),
                            stripeCustomerId,
                            stripeCustomerId);
            return rows.stream().filter(Objects::nonNull).findFirst();
        } catch (DataAccessException e) {
            log.warn(
                    "stripe.payment_methods lookup failed for customer {}: {}",
                    stripeCustomerId,
                    e.getMessage());
            return Optional.empty();
        }
    }

    private static Integer parseIntOrNull(ResultSet rs, String column) throws SQLException {
        String raw = rs.getString(column);
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Integer.valueOf(raw.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
