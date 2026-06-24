package stirling.software.saas.payg.stripe;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Objects;

import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import lombok.extern.slf4j.Slf4j;

/**
 * Read-only accessor for {@code stripe.invoices} (synced into Postgres by the Stripe Sync Engine).
 *
 * <p>Same defensive posture as {@link StripeSubscriptionDao}: when the {@code stripe} schema is
 * absent (H2 unit tests, sync engine not yet provisioned, or invoices not in the Sync Engine's
 * target list), the lookup degrades to an empty list with a WARN — the caller renders "no invoices
 * yet" rather than 500ing the page.
 */
@Slf4j
@Repository
@Profile("saas")
public class StripeInvoiceDao {

    /**
     * One invoice row as the portal needs it. Money is in minor units of {@code currency} (e.g.
     * cents for USD). {@code hostedInvoiceUrl} and {@code invoicePdf} are Stripe-hosted links that
     * are stable for the lifetime of the invoice; safe to use as deep links from the UI.
     *
     * <p>{@code description} is the product name from the subscription chain — the portal renders
     * this as the row label (matching Stripe's customer-portal row layout). Falls back to the
     * invoice's own {@code description} field, then to null when neither is set.
     */
    public record InvoiceRow(
            String id,
            String number,
            String status,
            Long totalMinor,
            String currency,
            LocalDateTime createdAt,
            LocalDateTime periodStart,
            LocalDateTime periodEnd,
            String hostedInvoiceUrl,
            String invoicePdf,
            String description) {}

    // Drafts are excluded: Stripe's API returns null for both
    // {@code hosted_invoice_url} and {@code invoice_pdf} on unfinalized
    // invoices, and Stripe's own customer portal hides drafts too — there's no
    // user-facing artefact to surface yet. The next finalize / webhook flips
    // the status and the invoice shows up automatically.
    //
    // The LATERAL join walks the same subscription → subscription_items → prices
    // → products chain {@link StripeSubscriptionDao} uses to get the per-doc
    // rate; here we use it to get the product NAME (e.g. "Stirling Processor
    // Plan") so the portal can render Stripe's row label rather than the
    // monospace invoice id. Falls back to {@code i.description}, then null.
    private static final String QUERY =
            "SELECT i.id, i.number, i.status::text AS status,"
                    + " i.total, i.currency,"
                    + " i.created, i.period_start, i.period_end,"
                    + " i.hosted_invoice_url, i.invoice_pdf,"
                    + " COALESCE(prod.name, i.description) AS description"
                    + " FROM stripe.invoices i"
                    + " LEFT JOIN LATERAL ("
                    + "   SELECT si.price FROM stripe.subscription_items si"
                    + "   WHERE si.subscription = i.subscription"
                    + "     AND COALESCE(si.deleted, false) = false"
                    + "   ORDER BY si.created DESC NULLS LAST LIMIT 1"
                    + " ) item ON true"
                    + " LEFT JOIN stripe.prices p ON p.id = item.price"
                    + " LEFT JOIN stripe.products prod ON prod.id = p.product"
                    + " WHERE i.customer = ?"
                    + "   AND i.status::text <> 'draft'"
                    + " ORDER BY i.created DESC NULLS LAST"
                    + " LIMIT ?";

    private final JdbcTemplate jdbcTemplate;

    public StripeInvoiceDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
    }

    /**
     * The most recent {@code limit} invoices for {@code stripeCustomerId}, newest first. Empty list
     * on missing schema / no rows / connectivity blip — the controller surfaces this as 200 with an
     * empty body rather than 500.
     */
    public List<InvoiceRow> findRecentByCustomer(String stripeCustomerId, int limit) {
        if (stripeCustomerId == null || stripeCustomerId.isBlank()) {
            return List.of();
        }
        int safeLimit = Math.max(1, Math.min(limit, 100));
        try {
            return jdbcTemplate.query(
                    QUERY,
                    (rs, i) ->
                            new InvoiceRow(
                                    rs.getString("id"),
                                    rs.getString("number"),
                                    rs.getString("status"),
                                    nullableLong(rs, "total"),
                                    rs.getString("currency"),
                                    toLocal(rs.getLong("created"), rs.wasNull()),
                                    toLocal(rs.getLong("period_start"), rs.wasNull()),
                                    toLocal(rs.getLong("period_end"), rs.wasNull()),
                                    rs.getString("hosted_invoice_url"),
                                    rs.getString("invoice_pdf"),
                                    rs.getString("description")),
                    stripeCustomerId,
                    safeLimit);
        } catch (DataAccessException e) {
            log.warn(
                    "stripe.invoices lookup failed for customer {}: {}",
                    stripeCustomerId,
                    e.getMessage());
            return List.of();
        }
    }

    private static Long nullableLong(java.sql.ResultSet rs, String column)
            throws java.sql.SQLException {
        long v = rs.getLong(column);
        return rs.wasNull() ? null : v;
    }

    private static LocalDateTime toLocal(long epochSeconds, boolean wasNull) {
        if (wasNull) return null;
        return LocalDateTime.ofInstant(Instant.ofEpochSecond(epochSeconds), ZoneId.systemDefault());
    }
}
