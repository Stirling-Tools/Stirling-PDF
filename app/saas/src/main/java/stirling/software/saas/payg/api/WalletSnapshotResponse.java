package stirling.software.saas.payg.api;

import java.math.BigDecimal;
import java.util.List;

/**
 * JSON payload returned by {@code GET /api/v1/payg/wallet}. Mirrors the {@code Wallet} type the
 * frontend {@code useWallet} hook consumes, plus the leader-only fields ({@code members},
 * breakdowns, recent activity) used by the PAYG Plan page.
 *
 * <p>Every number is real: the billing window is the Stripe subscription's current period (via Sync
 * Engine) for subscribed teams, the one-time free grant size comes from {@code
 * pricing_policy.free_tier_units} (live balance from {@code
 * payg_team_extensions.free_units_remaining}), and the per-document rate comes from the
 * subscription's Stripe Price. Fields that can't be resolved are {@code null} and the FE renders
 * "unknown" — never a substituted default.
 *
 * @param teamId the caller's primary team_id. Needed by the frontend so it can pass it to the
 *     Supabase edge functions that create Stripe Checkout / portal sessions — those run outside
 *     Spring Security and have no other way to resolve the caller's team.
 * @param status {@code "free"} when the team has no Stripe subscription; {@code "subscribed"} once
 *     a card is on file and the engine bills meter events.
 * @param role the current caller's role within their team — {@code "leader"} or {@code "member"}.
 *     Controls which UI variant the frontend renders.
 * @param billingPeriodStart inclusive ISO date (yyyy-MM-dd) for the current cycle — the Stripe
 *     subscription period when subscribed, the calendar month otherwise.
 * @param billingPeriodEnd exclusive ISO date (yyyy-MM-dd) for the current cycle.
 * @param billableUsed alias of {@code spendUnitsThisPeriod} kept for clarity in the FE. For a free
 *     team this is the lifetime free documents used so far ({@code freeAllowance − freeRemaining});
 *     for a subscribed team it's this month's net billable documents.
 * @param billableLimit the team's document ceiling for the matching window: the one-time free grant
 *     ({@code freeAllowance}) for free teams; {@code floor(cap / perDocRate)} paid docs/month for
 *     capped subscribed teams; {@code null} when subscribed with no cap (uncapped).
 * @param freeAllowance the team's one-time free document grant size (the "N" in "X of N free").
 *     Never resets; survives subscribing. Applies to billable categories only.
 * @param freeRemaining one-time free documents still available to the team ({@code
 *     payg_team_extensions.free_units_remaining}). 0 = grant exhausted.
 * @param pricePerDocMinor paid per-document rate in minor units of {@code currency} (may be
 *     fractional — Stripe supports sub-cent rates); {@code null} when the rate can't be resolved.
 * @param currency lower-case ISO 4217 currency of the subscription's Stripe Price; {@code null}
 *     when unknown (free teams, unresolved rate).
 * @param estimatedBillMinor estimated charges so far this period in minor units of {@code
 *     currency}: paid (Stripe-metered) documents this period × {@code pricePerDocMinor}. The free
 *     portion was already netted out at charge time. Informational — the Stripe invoice is
 *     authoritative. {@code null} when the rate is unknown.
 * @param capUsd the leader's monthly spending cap in major currency units; {@code null} when free
 *     or when the leader has opted into no-cap. (Field name predates multi-currency; the FE pairs
 *     it with {@code currency} for the symbol.)
 * @param noCap {@code true} when the leader has explicitly disabled the cap. Only meaningful when
 *     subscribed.
 * @param stripeSubscriptionId Stripe subscription id from {@code
 *     payg_team_extensions.payg_subscription_id}; {@code null} when status is free.
 * @param spendUnitsThisPeriod documents debited this cycle across billable categories.
 * @param categoryBreakdown per-category spend slice over the same billing window.
 * @param members leader-only roster of team members + their per-member sub-caps. Empty for member
 *     callers.
 * @param recent latest wallet-ledger entries (newest first) for the activity feed.
 */
public record WalletSnapshotResponse(
        Long teamId,
        String status,
        String role,
        String billingPeriodStart,
        String billingPeriodEnd,
        int billableUsed,
        Integer billableLimit,
        int freeAllowance,
        int freeRemaining,
        BigDecimal pricePerDocMinor,
        String currency,
        Long estimatedBillMinor,
        Integer capUsd,
        boolean noCap,
        String stripeSubscriptionId,
        int spendUnitsThisPeriod,
        CategoryBreakdown categoryBreakdown,
        List<MemberRow> members,
        List<ActivityRow> recent) {

    /** Per-category breakdown of {@code spendUnitsThisPeriod} for the in-app analytics widget. */
    public record CategoryBreakdown(int api, int ai, int automation) {}

    /**
     * One row of the team-members table on the leader's Plan page — display-only per-member usage.
     * (Per-member sub-caps aren't enforced yet. When they ship, a cap field returns here.)
     */
    public record MemberRow(String userId, String name, String email, int spendUnits) {}

    /**
     * One wallet-ledger entry shaped for the FE activity feed.
     *
     * @param id ledger entry id (stable React key)
     * @param kind lower-case billing category ({@code api} / {@code ai} / {@code automation}) or
     *     {@code other} for system entries
     * @param label human line, e.g. {@code "API usage"} or {@code "Refund — API"}
     * @param ts ISO-8601 local timestamp of the entry
     * @param docUnits absolute document count of the entry
     */
    public record ActivityRow(long id, String kind, String label, String ts, int docUnits) {}
}
