package stirling.software.saas.payg.billing;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * One team's billing facts for the current period, composed by {@link TeamBillingService}. The
 * entitlement guard enforces {@link #docCapUnits()}; the wallet endpoint displays every field — by
 * construction they cannot disagree.
 *
 * @param subscribed team has an active PAYG subscription (or a Stripe customer awaiting its
 *     subscription-created webhook)
 * @param subscriptionId {@code payg_team_extensions.payg_subscription_id}; null when free
 * @param periodStart inclusive start of the billing window — the Stripe subscription's current
 *     period when subscribed, calendar month otherwise
 * @param periodEnd exclusive end of the billing window
 * @param freeAllowanceUnits documents per cycle before paid billing starts ({@code
 *     pricing_policy.free_tier_units_per_cycle}); applies to billable categories only
 * @param perDocMinor paid per-document rate in minor units of {@link #currency()}; null when the
 *     rate can't be resolved (free team, edge fn unconfigured, Stripe blip) — display must say
 *     "unknown", never substitute
 * @param currency lower-case ISO 4217 of the subscription's Price; null when unknown
 * @param capMoneyMinor leader-set monthly spending cap in minor units ({@code
 *     wallet_policy.cap_source_money}); null = no cap configured
 * @param docCapUnits the document ceiling this period — free allowance plus what the money cap buys
 *     at the current rate; null = uncapped
 */
public record TeamBillingContext(
        boolean subscribed,
        String subscriptionId,
        LocalDateTime periodStart,
        LocalDateTime periodEnd,
        long freeAllowanceUnits,
        BigDecimal perDocMinor,
        String currency,
        Long capMoneyMinor,
        Long docCapUnits) {}
