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
import stirling.software.saas.payg.stripe.StripeSubscriptionDao.SubscriptionBilling;
import stirling.software.saas.payg.wallet.WalletPolicy;

/**
 * Single composition point for "what does billing look like for this team right now": billing
 * window, free allowance, per-document rate, money cap, and the document allowance the cap buys.
 * Both the entitlement hot path (cap enforcement) and the wallet endpoint (display) read from here
 * so the number the customer sees is the number the guard enforces.
 *
 * <p>Sources, in design terms (§10 "money lives in Stripe"):
 *
 * <ul>
 *   <li><b>Billing window</b> — the Stripe subscription's {@code current_period_start/end} via Sync
 *       Engine when the team is subscribed; calendar month otherwise (free tier resets monthly).
 *   <li><b>Free allowance</b> — {@code pricing_policy.free_tier_units_per_cycle}. Stripe knows
 *       nothing about it: the allowance also covers un-subscribed teams (who have no Stripe Price
 *       at all), so it's enforced app-side — free units are simply never metered.
 *   <li><b>Per-document rate</b> — the subscription Price's {@code unit_amount} via the synced
 *       {@code stripe.prices} row (PAYG prices are plain per-unit metered prices).
 *   <li><b>Cap</b> — {@code wallet_policy.cap_source_money} (minor units). The document allowance
 *       is derived here: {@code freeAllowance + floor(capMoney / perDocRate)}.
 * </ul>
 *
 * <p>Cached per team for {@value #CACHE_TTL_SECONDS}s — same TTL discipline as the entitlement
 * snapshot cache, which consumes this context. {@code EntitlementService.invalidate} cascades into
 * {@link #invalidate(Long)} so both caches drop together on cap edits and webhooks.
 */
@Slf4j
@Service
@Profile("saas")
public class TeamBillingService {

    static final int CACHE_TTL_SECONDS = 30;
    private static final int CACHE_MAX_SIZE = 10_000;

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

    /** Drop {@code teamId}'s entry after cap edits / subscription webhooks. */
    public void invalidate(Long teamId) {
        if (teamId != null) {
            cache.invalidate(teamId);
        }
    }

    private TeamBillingContext compute(Long teamId) {
        Optional<PaygTeamExtensions> extOpt = extensionsRepository.findById(teamId);
        Optional<WalletPolicy> walletPolicyOpt = walletPolicyRepository.findByTeamId(teamId);

        String subscriptionId = extOpt.map(PaygTeamExtensions::getPaygSubscriptionId).orElse(null);
        // payg_subscription_id is the designed switch; stripe_customer_id presence is the
        // pre-webhook stand-in kept so a team whose checkout completed but whose
        // subscription-created webhook hasn't landed yet still renders as subscribed.
        boolean subscribed =
                subscriptionId != null
                        || extOpt.map(PaygTeamExtensions::getStripeCustomerId)
                                .filter(s -> !s.isBlank())
                                .isPresent();

        long freeAllowance = resolveFreeAllowance(teamId);

        Optional<SubscriptionBilling> billing =
                subscriptionId != null
                        ? subscriptionDao.findBilling(subscriptionId)
                        : Optional.empty();

        LocalDateTime[] window =
                billing.map(b -> new LocalDateTime[] {b.periodStart(), b.periodEnd()})
                        .orElseGet(TeamBillingService::calendarMonthWindow);

        BigDecimal perDocMinor = billing.map(SubscriptionBilling::perDocMinor).orElse(null);
        String currency = billing.map(SubscriptionBilling::currency).orElse(null);

        Long capMoneyMinor = walletPolicyOpt.map(WalletPolicy::getCapSourceMoney).orElse(null);
        Long legacyCapUnits = walletPolicyOpt.map(WalletPolicy::getCapUnits).orElse(null);

        Long docCap =
                resolveDocCap(
                        subscribed, freeAllowance, capMoneyMinor, legacyCapUnits, perDocMinor);

        return new TeamBillingContext(
                subscribed,
                subscriptionId,
                window[0],
                window[1],
                freeAllowance,
                perDocMinor,
                currency,
                capMoneyMinor,
                docCap);
    }

    private long resolveFreeAllowance(Long teamId) {
        try {
            PricingPolicy policy = pricingPolicyService.getEffectivePolicy(teamId);
            Long free = policy.getFreeTierUnitsPerCycle();
            return free == null ? 0L : free;
        } catch (RuntimeException e) {
            // No effective policy is a seed/config error, not a request error. Zero allowance is
            // the conservative read (free team blocks at 402 rather than running up unbillable
            // work).
            log.warn("No effective pricing policy for team {}: {}", teamId, e.getMessage());
            return 0L;
        }
    }

    /**
     * The team's document ceiling for the current period; {@code null} = uncapped.
     *
     * <ul>
     *   <li>Free team → the free allowance is the ceiling.
     *   <li>Subscribed, no money cap → uncapped.
     *   <li>Subscribed, money cap + known rate → {@code free + floor(cap / rate)} (design §10's
     *       money→units translation, computed live so a Price change shifts the allowance).
     *   <li>Subscribed, money cap but rate unknown (price row unsynced / schema absent) → fall back
     *       to the stored {@code cap_units} so the cap stays enforced rather than silently lifting;
     *       WARN because that stored value may predate a price change.
     * </ul>
     */
    private Long resolveDocCap(
            boolean subscribed,
            long freeAllowance,
            Long capMoneyMinor,
            Long legacyCapUnits,
            BigDecimal perDocMinor) {
        if (!subscribed) {
            return freeAllowance;
        }
        if (capMoneyMinor == null) {
            return legacyCapUnits; // admin-set unit caps (source money null) still apply
        }
        if (perDocMinor != null) {
            BigDecimal paidDocs =
                    BigDecimal.valueOf(capMoneyMinor).divide(perDocMinor, 0, RoundingMode.FLOOR);
            return freeAllowance + paidDocs.longValue();
        }
        log.warn(
                "Per-document rate unavailable; enforcing stored cap_units fallback ({}).",
                legacyCapUnits);
        return legacyCapUnits;
    }

    /**
     * Estimated period charges in minor units of {@link TeamBillingContext#currency()}: spend
     * beyond the free allowance at the per-document rate. Informational — the Stripe invoice is
     * authoritative. Empty when the rate is unknown (never substitute a made-up number).
     */
    public Optional<Long> estimateBillMinor(TeamBillingContext ctx, long spendUnits) {
        if (ctx.perDocMinor() == null) {
            return Optional.empty();
        }
        long billableDocs = Math.max(0, spendUnits - ctx.freeAllowanceUnits());
        BigDecimal bill =
                ctx.perDocMinor()
                        .multiply(BigDecimal.valueOf(billableDocs))
                        .setScale(0, RoundingMode.HALF_UP);
        return Optional.of(bill.longValue());
    }

    /**
     * How many of a just-closed job's units are beyond the free allowance and therefore get metered
     * to Stripe. Stripe has no notion of our free tier (the Prices are plain per-unit), so
     * withholding happens here: with period spend {@code S} (ledger DEBITs, including this job's
     * {@code U} units) and allowance {@code F}, the billable portion is {@code clamp(S − F, 0, U)}.
     *
     * <p>Example: F=500, spend-before=490, U=20 → S=510 → meter 10 (10 free, 10 paid).
     *
     * <p>Concurrent closes can each see the other's units in {@code S}; the worst case
     * double-counts a boundary-straddling job by at most its own size, and the meter-event
     * reconciliation job is the corrective backstop. Single-instance dev/prod-today never hits
     * this.
     */
    public int billableUnitsForMeter(
            TeamBillingContext ctx, long periodSpendIncludingJob, int jobUnits) {
        long beyondFree = periodSpendIncludingJob - ctx.freeAllowanceUnits();
        if (beyondFree <= 0) {
            return 0;
        }
        return (int) Math.min(jobUnits, beyondFree);
    }

    /**
     * Documents a hypothetical money cap would buy (for the cap editor's live preview and the PATCH
     * /cap derived write): {@code free + floor(capMinor / rate)}. Empty when the rate is unknown.
     */
    public Optional<Long> docCapForMoney(TeamBillingContext ctx, long capMinor) {
        if (ctx.perDocMinor() == null) {
            return Optional.empty();
        }
        BigDecimal paidDocs =
                BigDecimal.valueOf(capMinor).divide(ctx.perDocMinor(), 0, RoundingMode.FLOOR);
        return Optional.of(ctx.freeAllowanceUnits() + paidDocs.longValue());
    }

    /**
     * Inclusive-start / exclusive-end window for the calendar month — the free-tier reset cycle
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
