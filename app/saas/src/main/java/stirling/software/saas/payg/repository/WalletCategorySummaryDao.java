package stirling.software.saas.payg.repository;

import java.time.LocalDate;
import java.util.EnumMap;
import java.util.Map;
import java.util.Objects;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import stirling.software.saas.payg.model.BillingCategory;

/**
 * Thin JDBC accessor for the {@code wallet_category_summary} view defined in V16. The view exists
 * because the in-app PAYG breakdown needs a per-team, per-month, per-category aggregate; doing it
 * as a view (rather than an ad-hoc query in the controller) keeps Supabase + Postgres on the same
 * surface and lets us push the {@code WHERE billing_category IS NOT NULL} filter into the planner.
 *
 * <p>Returns an {@link EnumMap} keyed on {@link BillingCategory} — the controller picks out the
 * three buckets the FE actually renders ({@code API}, {@code AI}, {@code AUTOMATION}). {@code
 * BYPASSED} debits are filtered out at the view layer; non-billable categories that slipped through
 * pre-V16 backfill are filtered on read.
 */
@Repository
@Profile("saas")
public class WalletCategorySummaryDao {

    private static final String QUERY =
            "SELECT billing_category, COALESCE(SUM(units_debited), 0) AS units"
                    + " FROM wallet_category_summary"
                    + " WHERE team_id = ?"
                    + " AND period_start = ?"
                    + " GROUP BY billing_category";

    private final JdbcTemplate jdbcTemplate;

    public WalletCategorySummaryDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
    }

    /**
     * Sum of units debited per {@link BillingCategory} for {@code teamId} in the calendar month
     * containing {@code periodStart}. Missing categories are mapped to {@code 0}.
     *
     * @param teamId team to summarise
     * @param periodStart first day of the calendar month — must match {@code date_trunc('month',
     *     occurred_at)} for the rows we want
     */
    public Map<BillingCategory, Long> sumByCategory(Long teamId, LocalDate periodStart) {
        Objects.requireNonNull(teamId, "teamId");
        Objects.requireNonNull(periodStart, "periodStart");
        Map<BillingCategory, Long> out = new EnumMap<>(BillingCategory.class);
        for (BillingCategory c : BillingCategory.values()) {
            out.put(c, 0L);
        }
        jdbcTemplate.query(
                QUERY,
                rs -> {
                    String name = rs.getString(1);
                    long units = rs.getLong(2);
                    if (name == null) {
                        return;
                    }
                    BillingCategory parsed;
                    try {
                        parsed = BillingCategory.valueOf(name);
                    } catch (IllegalArgumentException ignore) {
                        // Pre-V16 or out-of-band string; drop silently. View shouldn't emit these,
                        // but the FE doesn't render them anyway.
                        return;
                    }
                    out.put(parsed, units);
                },
                teamId,
                java.sql.Date.valueOf(periodStart));
        return out;
    }
}
