package stirling.software.saas.payg.stripe;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import lombok.extern.slf4j.Slf4j;

/**
 * Who the customer is billed to and where invoices go, read from {@code stripe.customers} (Sync
 * Engine mirror).
 *
 * <p>The mirror is one-way, so there is no update path by design: a customer edits these in
 * Stripe's hosted portal and the change arrives on the next customer event, as {@link
 * StripePaymentMethodDao} already relies on for the card.
 */
@Slf4j
@Repository
@Profile("saas")
public class StripeCustomerDetailsDao {

    /** Either field may be null. */
    public record CustomerDetails(String companyName, String invoiceEmail) {}

    /** The next renewal for one subscription, independent of the wallet's usage window. */
    public record UpcomingInvoice(String subscriptionId, String description, Instant date) {}

    /** Empty when subscription dates have not synced; never substitutes a grant reset date. */
    public List<UpcomingInvoice> findUpcomingInvoices(String customerId) {
        if (customerId == null || customerId.isBlank()) return List.of();
        try {
            return jdbcTemplate.query(
                    """
                    SELECT s.id, string_agg(DISTINCT product.name, ' + ') AS description,
                           COALESCE(MIN(si.current_period_end), s.current_period_end) AS period_end
                    FROM stripe.subscriptions s
                    LEFT JOIN stripe.subscription_items si ON si.subscription = s.id
                      AND COALESCE(si.deleted, false) = false
                    LEFT JOIN stripe.prices p ON p.id = si.price
                    LEFT JOIN stripe.products product ON product.id = p.product
                    WHERE s.customer = ? AND s.status IN ('active', 'trialing')
                      AND COALESCE(s.cancel_at_period_end, false) = false
                    GROUP BY s.id, s.current_period_end
                    HAVING COALESCE(MIN(si.current_period_end), s.current_period_end) IS NOT NULL
                    ORDER BY period_end, s.id
                    """,
                    (rs, i) ->
                            new UpcomingInvoice(
                                    rs.getString("id"),
                                    rs.getString("description"),
                                    Instant.ofEpochSecond(rs.getLong("period_end"))),
                    customerId);
        } catch (DataAccessException e) {
            log.warn("Stripe renewal dates unavailable for customer {}", customerId);
            return List.of();
        }
    }

    private static final String QUERY =
            "SELECT c.name AS name, c.email AS email FROM stripe.customers c WHERE c.id = ?";

    private final JdbcTemplate jdbcTemplate;

    public StripeCustomerDetailsDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
    }

    /** Empty on missing schema, unknown customer, or a connectivity blip. */
    public Optional<CustomerDetails> findDetails(String stripeCustomerId) {
        if (stripeCustomerId == null || stripeCustomerId.isBlank()) {
            return Optional.empty();
        }
        try {
            List<CustomerDetails> rows =
                    jdbcTemplate.query(
                            QUERY,
                            (rs, i) ->
                                    new CustomerDetails(
                                            blankToNull(rs.getString("name")),
                                            blankToNull(rs.getString("email"))),
                            stripeCustomerId);
            return rows.stream().filter(Objects::nonNull).findFirst();
        } catch (DataAccessException e) {
            log.warn(
                    "stripe.customers lookup failed for customer {}: {}",
                    stripeCustomerId,
                    e.getMessage());
            return Optional.empty();
        }
    }

    /** Stripe stores an unset name or email as an empty string as readily as null. */
    private static String blankToNull(String raw) {
        return raw == null || raw.isBlank() ? null : raw.trim();
    }
}
