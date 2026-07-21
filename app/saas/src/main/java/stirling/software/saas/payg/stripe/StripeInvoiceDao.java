package stirling.software.saas.payg.stripe;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

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
            String description,
            /** Billed units (PDFs) on this invoice — summed line-item quantity; null if unknown. */
            Long pdfsProcessed) {}

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
        List<InvoiceRow> rows;
        try {
            rows =
                    jdbcTemplate.query(
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
                                            rs.getString("description"),
                                            null),
                            stripeCustomerId,
                            safeLimit);
        } catch (DataAccessException e) {
            log.warn(
                    "stripe.invoices lookup failed for customer {}: {}",
                    stripeCustomerId,
                    e.getMessage());
            return List.of();
        }
        if (rows.isEmpty()) {
            return rows;
        }
        Map<String, Long> billed = sumBilledUnits(rows.stream().map(InvoiceRow::id).toList());
        if (billed.isEmpty()) {
            return rows;
        }
        return rows.stream()
                .map(
                        r ->
                                new InvoiceRow(
                                        r.id(),
                                        r.number(),
                                        r.status(),
                                        r.totalMinor(),
                                        r.currency(),
                                        r.createdAt(),
                                        r.periodStart(),
                                        r.periodEnd(),
                                        r.hostedInvoiceUrl(),
                                        r.invoicePdf(),
                                        r.description(),
                                        billed.get(r.id())))
                .toList();
    }

    /**
     * Sums billed quantity (PDFs) per invoice from the {@code stripe.invoices.lines} JSONB the Sync
     * Engine mirrors — line items live in {@code lines->'data'}, NOT a separate {@code
     * invoice_line_items} table (the sync engine never creates one).
     *
     * <p>Only the <b>metered</b> usage line counts: a Processor invoice can also carry flat
     * subscription-fee, proration and tax lines, each with its own {@code quantity}, so summing
     * every line would inflate the headline PDF count (usage 500 + a fee line of 1 → "501"). We
     * filter on {@code price.recurring.usage_type = 'metered'}. When no metered line is present the
     * subquery is {@code NULL} and the invoice is <b>omitted</b> from the map, so {@code
     * InvoiceRow.pdfsProcessed} stays {@code null} and the column renders "—" rather than "0".
     *
     * <p>Run SEPARATELY from the invoice query and defensively wrapped, so a missing/changed schema
     * degrades to an empty map (every row renders "—") instead of failing the whole invoice list.
     */
    private Map<String, Long> sumBilledUnits(List<String> invoiceIds) {
        if (invoiceIds.isEmpty()) {
            return Map.of();
        }
        String placeholders = invoiceIds.stream().map(id -> "?").collect(Collectors.joining(","));
        String sql =
                "SELECT i.id AS invoice_id,"
                        + " (SELECT SUM((l->>'quantity')::int)"
                        + "    FROM jsonb_array_elements(COALESCE(i.lines->'data', '[]'::jsonb)) AS l"
                        + "   WHERE l->'price'->'recurring'->>'usage_type' = 'metered') AS qty"
                        + " FROM stripe.invoices i"
                        + " WHERE i.id IN ("
                        + placeholders
                        + ")";
        try {
            Map<String, Long> map = new HashMap<>();
            jdbcTemplate.query(
                    sql,
                    (java.sql.ResultSet rs) -> {
                        long qty = rs.getLong("qty");
                        if (!rs.wasNull()) {
                            // null (no metered line) → leave the key absent → renders "—".
                            map.put(rs.getString("invoice_id"), qty);
                        }
                    },
                    invoiceIds.toArray());
            return map;
        } catch (DataAccessException e) {
            log.warn("stripe.invoices line-quantity sum failed: {}", e.getMessage());
            return Map.of();
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
