package stirling.software.saas.payg.billing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.policy.PricingPolicy;
import stirling.software.saas.payg.policy.PricingPolicyService;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.repository.WalletPolicyRepository;
import stirling.software.saas.payg.stripe.StripeSubscriptionDao;
import stirling.software.saas.payg.stripe.StripeSubscriptionDao.PriceRate;
import stirling.software.saas.payg.stripe.StripeSubscriptionDao.SubscriptionBilling;
import stirling.software.saas.payg.wallet.WalletPolicy;

/**
 * Single composition point for "what does billing look like for this team right now." Both the
 * entitlement hot path and the wallet endpoint read from here, so what the customer sees is what
 * the guard enforces.
 *
 * <p>Two independent meters (design 2026-06-11 — the free allowance is a one-time lifetime grant):
 *
 * <ul>
 *   <li><b>Free grant</b> — one-time, per team. Size from {@code pricing_policy.free_tier_units};
 *       live balance from the {@code payg_team_extensions.free_units_remaining} counter (maintained
 *       by the charge pipeline). Never resets, survives subscribing. Gates un-subscribed teams and
 *       drives the free-vs-paid split.
 *   <li><b>Monthly window + cap</b> — the Stripe subscription period (calendar month otherwise) and
 *       the optional money cap. Govern the subscribed invoice + spending cap only. The per-document
 *       rate is the synced {@code stripe.prices.unit_amount} (PAYG prices are plain per-unit).
 * </ul>
 *
 * <p>Cached per team for {@value #CACHE_TTL_SECONDS}s. {@code EntitlementService.invalidate}
 * cascades into {@link #invalidate(Long)} so both caches drop together on cap edits / webhooks.
 * Note the cached context's {@code freeRemainingUnits} is a 30s-stale read of the counter — the
 * authoritative decrement happens in {@code JobChargeService} against the row directly; this cache
 * is for display + the entitlement gate, where 30s staleness is the accepted cap-evaluation floor.
 */
@Slf4j
@Service
@Profile("saas")
public class TeamBillingService {

    static final int CACHE_TTL_SECONDS = 30;
    private static final int CACHE_MAX_SIZE = 10_000;

    /**
     * In-app display/estimate currency. The app prices in dollars; Stripe handles real currency
     * selection at checkout. Used to pick the right Price for un-subscribed teams.
     */
    private static final String DISPLAY_CURRENCY = "usd";

    /**
     * Stripe Price {@code lookup_key} for the PAYG per-document price. The stable handle we resolve
     * an un-subscribed team's rate from (the default policy carries no price ids in the seed).
     */
    private static final String PAYG_LOOKUP_KEY = "plan:processor";

    private final PaygTeamExtensionsRepository extensionsRepository;
    private final WalletPolicyRepository walletPolicyRepository;
    private final PricingPolicyService pricingPolicyService;
    private final StripeSubscriptionDao subscriptionDao;

    private final Cache<Long, TeamBillingContext> cache;

    public TeamBillingService(
            PaygTeamExtensionsRepository extensionsRepository,
            WalletPolicyRepository walletPolicyRepository,
            PricingPolicyService pricingPolicyService,
            StripeSubscriptionDao subscriptionDao) {
        this.extensionsRepository =
                Objects.requireNonNull(extensionsRepository, "extensionsRepository");
        this.walletPolicyRepository =
                Objects.requireNonNull(walletPolicyRepository, "walletPolicyRepository");
        this.pricingPolicyService =
                Objects.requireNonNull(pricingPolicyService, "pricingPolicyService");
        this.subscriptionDao = Objects.requireNonNull(subscriptionDao, "subscriptionDao");
        this.cache =
                Caffeine.newBuilder()
                        .maximumSize(CACHE_MAX_SIZE)
                        .expireAfterWrite(Duration.ofSeconds(CACHE_TTL_SECONDS))
                        .build();
    }

    public TeamBillingContext forTeam(Long teamId) {
        Objects.requireNonNull(teamId, "teamId");
        return cache.get(teamId, this::compute);
    }

    /** Drop {@code teamId}'s entry after cap edits / subscription webhooks / grant consumption. */
    public void invalidate(Long teamId) {
        if (teamId != null) {
            cache.invalidate(teamId);
        }
    }

    private TeamBillingContext compute(Long teamId) {
        Optional<PaygTeamExtensions> extOpt = extensionsRepository.findById(teamId);
        Optional<WalletPolicy> walletPolicyOpt = walletPolicyRepository.findByTeamId(teamId);

        String subscriptionId = extOpt.map(PaygTeamExtensions::getPaygSubscriptionId).orElse(null);
        // payg_subscription_id is the single subscription switch. payg_link_subscription sets it
        // (alongside stripe_customer_id, in the same write) on customer.subscription.created;
        // payg_unlink_subscription nulls it on customer.subscription.deleted while deliberately
        // keeping stripe_customer_id so a future re-subscribe can reuse the Stripe customer. So a
        // cancelled team has a null subscription id and must read as free again.
        //
        // We deliberately do NOT fall back to stripe_customer_id presence. payg_link_subscription
        // is the only writer of that column and it writes it together with the subscription id, so
        // it can never be set "before the webhook lands" — there is no gap for it to bridge. A
        // customer-id fallback would instead keep every team that ever subscribed pinned to
        // subscribed forever (the customer outlives the subscription), which is the cancelled-team
        // bug this guards against.
        boolean subscribed = subscriptionId != null;

        long freeGrant = resolveGrant(teamId);
        long freeRemaining =
                extOpt.map(PaygTeamExtensions::getFreeUnitsRemaining)
                        .map(Long::longValue)
                        .orElse(0L);

        Optional<SubscriptionBilling> billing =
                subscriptionId != null
                        ? subscriptionDao.findBilling(subscriptionId)
                        : Optional.empty();

        LocalDateTime[] window =
                billing.map(b -> new LocalDateTime[] {b.periodStart(), b.periodEnd()})
                        .orElseGet(TeamBillingService::calendarMonthWindow);

        BigDecimal perDocMinor = billing.map(SubscriptionBilling::perDocMinor).orElse(null);
        String currency = billing.map(SubscriptionBilling::currency).orElse(null);

        // Un-subscribed teams have no Stripe subscription to read a rate from, but the cap
        // estimate (the upgrade flow's "≈ N paid PDFs/month") still needs one. Resolve it from
        // the default policy's USD Price — Stripe hasn't assigned the team a currency yet, and
        // the whole app prices in dollars. Display-only: resolveMonthlyCap stays gated on
        // `subscribed`, so this never starts enforcing a cap on a free team.
        if (!subscribed && perDocMinor == null) {
            Optional<PriceRate> rate =
                    subscriptionDao.findRateByLookupKey(PAYG_LOOKUP_KEY, DISPLAY_CURRENCY);
            if (rate.isPresent()) {
                perDocMinor = rate.get().perDocMinor();
                currency = rate.get().currency();
            }
        }

        Long capMoneyMinor = walletPolicyOpt.map(WalletPolicy::getCapSourceMoney).orElse(null);
        Long legacyCapUnits = walletPolicyOpt.map(WalletPolicy::getCapUnits).orElse(null);

        Long monthlyCapDocUnits =
                resolveMonthlyCap(subscribed, capMoneyMinor, legacyCapUnits, perDocMinor);

        return new TeamBillingContext(
                subscribed,
                subscriptionId,
                window[0],
                window[1],
                freeGrant,
                freeRemaining,
                perDocMinor,
                currency,
                capMoneyMinor,
                monthlyCapDocUnits);
    }

    /** The policy grant size — the "N" denominator for display; the counter is the live balance. */
    private long resolveGrant(Long teamId) {
        try {
            PricingPolicy policy = pricingPolicyService.getEffectivePolicy(teamId);
            Long grant = policy.getFreeTierUnits();
            return grant == null ? 0L : grant;
        } catch (RuntimeException e) {
            log.warn("No effective pricing policy for team {}: {}", teamId, e.getMessage());
            return 0L;
        }
    }

    /**
     * The subscribed monthly paid-document ceiling; {@code null} = uncapped or not subscribed. The
     * one-time free grant is NOT added here — it's a separate lifetime pool consumed at charge
     * time. The cap purely limits how many paid documents the team will fund per billing period.
     *
     * <ul>
     *   <li>not subscribed → null (the free grant, not a money cap, is what bounds them);
     *   <li>subscribed, no money cap → uncapped (null), unless an admin set raw {@code cap_units};
     *   <li>subscribed, money cap + known rate → {@code floor(capMoney / perDocRate)};
     *   <li>subscribed, money cap but rate unknown → stored {@code cap_units} fallback (WARN).
     * </ul>
     */
    private Long resolveMonthlyCap(
            boolean subscribed, Long capMoneyMinor, Long legacyCapUnits, BigDecimal perDocMinor) {
        if (!subscribed) {
            return null;
        }
        if (capMoneyMinor == null) {
            return legacyCapUnits; // admin-set unit cap (source money null) still applies
        }
        if (perDocMinor != null && perDocMinor.signum() > 0) {
            return BigDecimal.valueOf(capMoneyMinor)
                    .divide(perDocMinor, 0, RoundingMode.FLOOR)
                    .longValue();
        }
        log.warn(
                "Per-document rate unavailable; enforcing stored cap_units fallback ({}).",
                legacyCapUnits);
        return legacyCapUnits;
    }

    /**
     * Estimated charges for the current period in minor units of {@link
     * TeamBillingContext#currency()}: the paid (metered) documents this period at the per-document
     * rate. Informational — the Stripe invoice is authoritative. Empty when the rate is unknown.
     *
     * @param paidUnitsThisPeriod metered documents this period ({@code payg_units −
     *     free_units_consumed} summed over the period's charged jobs)
     */
    public Optional<Long> estimateBillMinor(TeamBillingContext ctx, long paidUnitsThisPeriod) {
        if (ctx.perDocMinor() == null) {
            return Optional.empty();
        }
        long paid = Math.max(0, paidUnitsThisPeriod);
        BigDecimal bill =
                ctx.perDocMinor()
                        .multiply(BigDecimal.valueOf(paid))
                        .setScale(0, RoundingMode.HALF_UP);
        return Optional.of(bill.longValue());
    }

    /**
     * Documents a hypothetical monthly money cap would buy: {@code floor(capMinor / rate)}. Used by
     * the cap editor's live preview and the {@code PATCH /cap} derived write. The free grant is NOT
     * added — it's a separate one-time pool. Empty when the rate is unknown.
     */
    public Optional<Long> docCapForMoney(TeamBillingContext ctx, long capMinor) {
        if (ctx.perDocMinor() == null || ctx.perDocMinor().signum() <= 0) {
            return Optional.empty();
        }
        return Optional.of(
                BigDecimal.valueOf(capMinor)
                        .divide(ctx.perDocMinor(), 0, RoundingMode.FLOOR)
                        .longValue());
    }

    /**
     * Inclusive-start / exclusive-end window for the calendar month — the monthly billing window
     * used when there's no Stripe subscription period to anchor on.
     */
    static LocalDateTime[] calendarMonthWindow() {
        return calendarMonthWindow(LocalDateTime.now());
    }

    /** Test seam — accepts a clock value so tests don't race the calendar boundary. */
    static LocalDateTime[] calendarMonthWindow(LocalDateTime now) {
        java.time.YearMonth ym = java.time.YearMonth.from(now);
        return new LocalDateTime[] {
            ym.atDay(1).atStartOfDay(), ym.plusMonths(1).atDay(1).atStartOfDay()
        };
    }
}
