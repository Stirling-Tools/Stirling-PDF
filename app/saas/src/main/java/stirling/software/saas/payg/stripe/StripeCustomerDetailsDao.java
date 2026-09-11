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
