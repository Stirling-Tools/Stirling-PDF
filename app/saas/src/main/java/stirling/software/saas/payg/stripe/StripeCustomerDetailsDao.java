package stirling.software.saas.payg.stripe;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import lombok.extern.slf4j.Slf4j;

/**
 * The customer's own billing details, read from {@code stripe.customers} (Sync Engine mirror).
 *
 * <p>Answers "who is this billed to" and "where do the invoices go", which are Stripe's facts
 * rather than ours: we never store a second copy to drift from. The mirror is one-way, so this
 * never writes and there is no update path here by design. A customer edits these in Stripe's
 * hosted portal, and the change arrives back through the sync engine on the next customer event,
 * which is the same arrangement {@link StripePaymentMethodDao} already relies on for the card.
 *
 * <p>Next-invoice timing is deliberately NOT read here: the wallet already carries the period end,
 * so adding a second source for the same date would let the two disagree.
 */
@Slf4j
@Repository
@Profile("saas")
public class StripeCustomerDetailsDao {

    /** Company name and invoice email as Stripe holds them; either may be null. */
    public record CustomerDetails(String companyName, String invoiceEmail) {}

    private static final String QUERY =
            "SELECT c.name AS name, c.email AS email FROM stripe.customers c WHERE c.id = ?";

    private final JdbcTemplate jdbcTemplate;

    public StripeCustomerDetailsDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
    }

    /** The customer's details; empty on missing schema / unknown customer / connectivity blip. */
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
