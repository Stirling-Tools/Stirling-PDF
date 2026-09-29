package stirling.software.saas.payg.entitlement;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.billing.TeamBillingContext;
import stirling.software.saas.payg.billing.TeamBillingService;
import stirling.software.saas.payg.bundle.PrepaidBundleService;
import stirling.software.saas.payg.cap.CapEvaluator;
import stirling.software.saas.payg.cap.CapEvaluator.Evaluation;
import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.model.FeatureSet;
import stirling.software.saas.payg.repository.PaygShadowChargeRepository;
import stirling.software.saas.payg.repository.WalletPolicyRepository;
import stirling.software.saas.payg.wallet.WalletPolicy;

/**
 * Hot-path entitlement lookup. Returns the {@link EntitlementSnapshot} for a team: the billing
 * facts (window, free allowance, document cap) come from {@link TeamBillingService}; this service
 * layers metered spend (excluding included and prepaid units) and the warn/degrade evaluation on
 * top.
 *
 * <p>Backed by a per-team Caffeine cache with {@value #CACHE_TTL_SECONDS}s TTL and {@value
 * #CACHE_MAX_SIZE}-entry cap. The TTL is the correctness floor — a cap change becomes visible on
 * every instance within that window without coordination. Mutators (wallet policy admin updates,
 * subscription webhook handlers) call {@link #invalidate(Long)} to drop a single team's entry
 * immediately on the originating instance.
 */
@Slf4j
@Service
@Profile("saas")
public class EntitlementService {

    static final int CACHE_TTL_SECONDS = 30;
    private static final int CACHE_MAX_SIZE = 10_000;

    private static final int WARN_AT_PCT = 80;
    private static final int DEGRADE_AT_PCT = 100;

    private final TeamBillingService teamBillingService;
    private final WalletPolicyRepository walletPolicyRepository;
    private final PaygShadowChargeRepository shadowRepository;
    private final PrepaidBundleService prepaidBundleService;

    private final Cache<Long, EntitlementSnapshot> snapshotCache;

    public EntitlementService(
            TeamBillingService teamBillingService,
            WalletPolicyRepository walletPolicyRepository,
            PaygShadowChargeRepository shadowRepository,
            PrepaidBundleService prepaidBundleService) {
        this.teamBillingService = Objects.requireNonNull(teamBillingService, "teamBillingService");
        this.walletPolicyRepository =
                Objects.requireNonNull(walletPolicyRepository, "walletPolicyRepository");
        this.shadowRepository = Objects.requireNonNull(shadowRepository, "shadowRepository");
        this.prepaidBundleService =
                Objects.requireNonNull(prepaidBundleService, "prepaidBundleService");
        this.snapshotCache =
                Caffeine.newBuilder()
                        .maximumSize(CACHE_MAX_SIZE)
                        .expireAfterWrite(Duration.ofSeconds(CACHE_TTL_SECONDS))
                        .recordStats()
                        .build();
    }

    /**
     * Returns the entitlement snapshot for {@code teamId}. Caches per-team for {@value
     * #CACHE_TTL_SECONDS}s — burst requests share a single query over charged usage.
     *
     * <p>{@code null} teamId throws — the guard short-circuits team-less requests upstream so a
     * null reach here is a programming error.
     */
    public EntitlementSnapshot getSnapshot(Long teamId) {
        Objects.requireNonNull(teamId, "teamId");
        return snapshotCache.get(teamId, this::computeSnapshot);
    }

    /**
     * Drops {@code teamId}'s cache entry. Call after subscription state changes (webhook handlers),
     * cap edits, or manual ledger adjustments so the next read recomputes immediately rather than
     * waiting out the TTL. Also drops the underlying billing context so window/cap facts recompute
     * together with the spend.
     */
    public void invalidate(Long teamId) {
        if (teamId != null) {
            snapshotCache.invalidate(teamId);
            teamBillingService.invalidate(teamId);
        }
    }

    /** Visible for tests. */
    long cacheSize() {
        return snapshotCache.estimatedSize();
    }

    @Transactional(readOnly = true)
    EntitlementSnapshot computeSnapshot(Long teamId) {
        TeamBillingContext billing = teamBillingService.forTeam(teamId);
        Optional<WalletPolicy> walletPolicyOpt = walletPolicyRepository.findByTeamId(teamId);

        FeatureSet degradedSet =
                walletPolicyOpt.map(WalletPolicy::getDegradedFeatureSet).orElse(FeatureSet.MINIMAL);
        int warnAtPct =
                walletPolicyOpt
                        .map(WalletPolicy::getWarnAtPct)
                        .filter(Objects::nonNull)
                        .orElse(WARN_AT_PCT);
        int degradeAtPct =
                walletPolicyOpt
                        .map(WalletPolicy::getDegradeAtPct)
                        .filter(Objects::nonNull)
                        .orElse(DEGRADE_AT_PCT);

        // Subscription-anchored window when subscribed; calendar month otherwise. Used for the
        // subscribed monthly cap + the displayed billing period.
        LocalDateTime periodStart = billing.periodStart();
        LocalDateTime periodEnd = billing.periodEnd();

        Evaluation eval;
        long snapshotSpend;
        Long snapshotCap;

        if (billing.subscribed()) {
            long periodSpend =
                    Math.max(0, shadowRepository.sumPaidUnits(teamId, periodStart, periodEnd));
            Long cap = billing.monthlyCapDocUnits();
            eval = CapEvaluator.evaluate(periodSpend, cap, warnAtPct, degradeAtPct, degradedSet);
            if (eval.state() == EntitlementState.DEGRADED
                    && (billing.freeRemainingUnits() > 0L
                            || prepaidBundleService.prepaidRemainingUnits(teamId) > 0L)) {
                eval = fullyEntitledOnPrepaid();
            }
            snapshotSpend = periodSpend;
            snapshotCap = cap;
        } else {
            // A prepaid pool outranks an exhausted grant: paid-for capacity is usable on its own
            // merit, with no subscription. Only with both gone do billable categories hard-stop.
            long grant = billing.freeGrantUnits();
            long remaining = billing.freeRemainingUnits();
            long used = Math.max(0L, grant - remaining);
            if (remaining <= 0L) {
                long prepaidRemaining = prepaidBundleService.prepaidRemainingUnits(teamId);
                if (prepaidRemaining > 0L) {
                    eval = fullyEntitledOnPrepaid();
                } else {
                    eval =
                            new Evaluation(
                                    EntitlementState.DEGRADED,
                                    degradedSet,
                                    CapEvaluator.gatesFor(degradedSet));
                }
            } else {
                eval = CapEvaluator.evaluate(used, grant, warnAtPct, degradeAtPct, degradedSet);
            }
            snapshotSpend = used;
            snapshotCap = grant;
        }

        return new EntitlementSnapshot(
                eval.state(),
                eval.featureSet(),
                List.copyOf(eval.enabledGates()),
                snapshotSpend,
                snapshotCap,
                periodStart,
                periodEnd,
                billing.subscribed());
    }

    /**
     * A team holding a live prepaid pool is fully entitled regardless of the free-grant or the
     * monthly-cap gate: the pool is drawn in the charge pipeline and its units are netted out of
     * metered spend, so it sits OUTSIDE both gates. All feature gates are on. Shared by the
     * unsubscribed (grant-exhausted) and subscribed (over-cap) branches.
     */
    private static Evaluation fullyEntitledOnPrepaid() {
        return new Evaluation(
                EntitlementState.FULL, FeatureSet.FULL, CapEvaluator.gatesFor(FeatureSet.FULL));
    }

    /**
     * Inclusive-start / exclusive-end window for the calendar-month period. Test seam — takes a
     * clock value so tests don't race the calendar boundary. The live snapshot window comes from
     * {@link TeamBillingService}; this remains for the forthcoming {@code BILLING_CYCLE} work.
     */
    static LocalDateTime[] currentMonthWindow(LocalDateTime now) {
        YearMonth ym = YearMonth.from(now);
        LocalDateTime start = ym.atDay(1).atStartOfDay();
        LocalDateTime end = ym.plusMonths(1).atDay(1).atStartOfDay();
        return new LocalDateTime[] {start, end};
    }
}
