package stirling.software.saas.payg.billing;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * One team's billing facts, composed by {@link TeamBillingService}. Two independent meters live
 * here and must not be conflated:
 *
 * <ul>
 *   <li>the <b>one-time lifetime free grant</b> ({@link #freeGrantUnits} total, {@link
 *       #freeRemainingUnits} left) — gates an un-subscribed team and decides the free-vs-paid split
 *       of every job; never resets, survives subscribing;
 *   <li>the <b>monthly billing window</b> ({@link #periodStart}/{@link #periodEnd}) and the
 *       optional monthly spending cap ({@link #monthlyCapDocUnits}) — govern the subscribed invoice
 *       + cap only.
 * </ul>
 *
 * @param subscribed team has a live PAYG subscription — i.e. {@code payg_subscription_id} is set.
 *     Cleared by {@code payg_unlink_subscription} on cancellation, so a cancelled team reads false.
 * @param subscriptionId {@code payg_team_extensions.payg_subscription_id}; null when free
 * @param periodStart inclusive start of the monthly billing window — the Stripe subscription's
 *     current period when subscribed, calendar month otherwise
 * @param periodEnd exclusive end of the monthly billing window
 * @param freeGrantUnits the team's one-time free grant size (policy {@code free_tier_units}); the
 *     denominator for "used X of N free". Never resets.
 * @param freeRemainingUnits one-time free documents still available ({@code
 *     payg_team_extensions.free_units_remaining}). 0 = grant exhausted.
 * @param perDocMinor paid per-document rate in minor units of {@link #currency()}; null when the
 *     rate can't be resolved (free team, price row unsynced) — display "unknown", never substitute
 * @param currency lower-case ISO 4217 of the subscription's Price; null when unknown
 * @param capMoneyMinor leader-set monthly spending cap in minor units ({@code
 *     wallet_policy.cap_source_money}); null = no cap configured
 * @param monthlyCapDocUnits the subscribed monthly paid-document ceiling — {@code floor(capMoney /
 *     perDocRate)}; null = uncapped, or the team is not subscribed
 */
public record TeamBillingContext(
        boolean subscribed,
        String subscriptionId,
        LocalDateTime periodStart,
        LocalDateTime periodEnd,
        long freeGrantUnits,
        long freeRemainingUnits,
        BigDecimal perDocMinor,
        String currency,
        Long capMoneyMinor,
        Long monthlyCapDocUnits) {}
