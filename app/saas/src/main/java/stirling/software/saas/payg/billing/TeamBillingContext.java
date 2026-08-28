package stirling.software.saas.payg.billing;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * One team's billing facts, composed by {@link TeamBillingService}. Two separate pools, both
 * measured over the same window:
 *
 * <ul>
 *   <li>the <b>free grant</b> ({@link #freeGrantUnits} per period, {@link #freeRemainingUnits} left
 *       in this one) — gates an un-subscribed team and decides the free-vs-paid split of every job;
 *   <li>the <b>billing window</b> ({@link #periodStart}/{@link #periodEnd}) and the optional
 *       spending cap ({@link #monthlyCapDocUnits}) — govern the subscribed invoice + cap only.
 * </ul>
 *
 * @param subscribed team has a live PAYG subscription — i.e. {@code payg_subscription_id} is set.
 *     Cleared by {@code payg_unlink_subscription} on cancellation, so a cancelled team reads false.
 * @param subscriptionId {@code payg_team_extensions.payg_subscription_id}; null when free
 * @param periodStart inclusive start of the billing window — the Stripe subscription's current
 *     period when subscribed, calendar month otherwise. Also the period the free grant resets on.
 * @param periodEnd exclusive end of the billing window
 * @param freeGrantUnits the team's free grant size per period (policy {@code free_tier_units}); the
 *     denominator for "used X of N free"
 * @param freeRemainingUnits free documents still available in this period ({@code
 *     payg_team_extensions.free_units_remaining}, via {@code
 *     TeamBillingService.remainingForPeriod}). 0 = exhausted.
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
