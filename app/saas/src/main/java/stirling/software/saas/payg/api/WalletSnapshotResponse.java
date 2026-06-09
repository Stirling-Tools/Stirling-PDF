package stirling.software.saas.payg.api;

import java.util.List;

/**
 * JSON payload returned by {@code GET /api/v1/payg/wallet}. Mirrors the {@code Wallet} type the
 * frontend {@code useWallet} hook consumes, plus the leader-only fields ({@code members},
 * breakdowns, recent activity) used by the PAYG Plan page.
 *
 * <p>Field shape is contract-stable: any new optional field must default to a sentinel that the
 * frontend's reuse-if-equal comparison treats as "unchanged". {@code recent} is reserved for a
 * future activity feed and stays empty in V1.
 *
 * @param status {@code "free"} when the team has no Stripe subscription; {@code "subscribed"} once
 *     a card is on file and the engine bills meter events.
 * @param role the current caller's role within their team — {@code "leader"} or {@code "member"}.
 *     Controls which UI variant the frontend renders.
 * @param billingPeriodStart inclusive ISO date (yyyy-MM-dd) for the current cycle.
 * @param billingPeriodEnd exclusive ISO date (yyyy-MM-dd) for the current cycle.
 * @param billableUsed alias of {@code spendUnitsThisPeriod} kept for clarity in the FE.
 * @param billableLimit free-tier ceiling in units. {@code 500} during V1 until {@code
 *     pricing_policy.free_tier_units_per_cycle} (PR #6532) lands and feeds this number live.
 * @param capUsd dollar cap when {@code status == "subscribed"}; {@code null} when free or when the
 *     leader has opted into no-cap.
 * @param noCap {@code true} when the leader has explicitly disabled the cap. Only meaningful when
 *     subscribed.
 * @param stripeSubscriptionId Stripe subscription id; {@code null} when status is free. Sourced
 *     from {@code payg_team_extensions.payg_subscription_id} once PR #6532 lands; falls back to
 *     {@code null} in this branch (the column doesn't exist yet — flagged dependency).
 * @param spendUnitsThisPeriod sum of billable units debited this cycle.
 * @param categoryBreakdown per-category spend slice driven by the {@code wallet_category_summary}
 *     view. Zeroed when the team has no billable activity this period.
 * @param members leader-only roster of team members + their per-member sub-caps. Empty for member
 *     callers.
 * @param recent reserved for a future "recent activity" feed; empty in V1.
 */
public record WalletSnapshotResponse(
        String status,
        String role,
        String billingPeriodStart,
        String billingPeriodEnd,
        int billableUsed,
        int billableLimit,
        Integer capUsd,
        boolean noCap,
        String stripeSubscriptionId,
        int spendUnitsThisPeriod,
        CategoryBreakdown categoryBreakdown,
        List<MemberRow> members,
        List<Object> recent) {

    /**
     * Per-category breakdown of {@code spendUnitsThisPeriod} for the in-app analytics widget.
     * Sourced from {@code wallet_category_summary} (a Postgres view that filters out {@code
     * BYPASSED} and {@code NULL} rows so manual / pre-V16 entries don't pollute the breakdown).
     */
    public record CategoryBreakdown(int api, int ai, int automation) {}

    /**
     * One row of the team-members table on the leader's Plan page. {@code capUnits} is the
     * per-member sub-cap (null = bounded only by the team cap).
     */
    public record MemberRow(
            String userId, String name, String email, Integer capUnits, int spendUnits) {}
}
