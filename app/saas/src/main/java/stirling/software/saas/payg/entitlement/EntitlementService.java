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
import stirling.software.saas.payg.cap.CapEvaluator;
import stirling.software.saas.payg.cap.CapEvaluator.Evaluation;
import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.FeatureSet;
import stirling.software.saas.payg.model.LedgerEntryType;
import stirling.software.saas.payg.repository.WalletLedgerRepository;
import stirling.software.saas.payg.repository.WalletPolicyRepository;
import stirling.software.saas.payg.wallet.WalletPolicy;

/**
 * Hot-path entitlement lookup. Returns the {@link EntitlementSnapshot} for a team: the billing
 * facts (window, free allowance, document cap) come from {@link TeamBillingService}; this service
 * layers the period spend (ledger SUM over that window) and the warn/degrade evaluation on top.
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
    private final WalletLedgerRepository ledgerRepository;

    private final Cache<Long, EntitlementSnapshot> snapshotCache;

    public EntitlementService(
            TeamBillingService teamBillingService,
            WalletPolicyRepository walletPolicyRepository,
            WalletLedgerRepository ledgerRepository) {
        this.teamBillingService = Objects.requireNonNull(teamBillingService, "teamBillingService");
        this.walletPolicyRepository =
                Objects.requireNonNull(walletPolicyRepository, "walletPolicyRepository");
        this.ledgerRepository = Objects.requireNonNull(ledgerRepository, "ledgerRepository");
        this.snapshotCache =
                Caffeine.newBuilder()
                        .maximumSize(CACHE_MAX_SIZE)
                        .expireAfterWrite(Duration.ofSeconds(CACHE_TTL_SECONDS))
                        .recordStats()
                        .build();
    }

    /**
     * Returns the entitlement snapshot for {@code teamId}. Caches per-team for {@value
     * #CACHE_TTL_SECONDS}s — burst requests share a single SUM query against the ledger.
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

        // The document ceiling: free allowance for free teams; free allowance + what the money
        // cap buys at the current per-document rate for subscribed teams; null = uncapped.
        Long capUnits = billing.docCapUnits();
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

        // Subscription-anchored window when subscribed; calendar month otherwise.
        LocalDateTime periodStart = billing.periodStart();
        LocalDateTime periodEnd = billing.periodEnd();

        // wallet_ledger stores debits as negative amount_units (signed). The cap evaluator wants
        // positive spend, so we negate the SUM. COALESCE in the JPQL guarantees 0 for no-rows.
        long signedDebitSum =
                ledgerRepository.sumPeriodAmount(
                        teamId, LedgerEntryType.DEBIT, periodStart, periodEnd);
        long spendUnits = signedDebitSum < 0 ? -signedDebitSum : 0L;

        Evaluation eval =
                CapEvaluator.evaluate(spendUnits, capUnits, warnAtPct, degradeAtPct, degradedSet);

        return new EntitlementSnapshot(
                eval.state(),
                eval.featureSet(),
                List.copyOf(eval.enabledGates()),
                spendUnits,
                capUnits,
                periodStart,
                periodEnd);
    }

    /**
     * Inclusive-start / exclusive-end window for the calendar-month period. Calendar-month is the
     * only period used at this stage; once {@code BILLING_CYCLE} ships the window resolution moves
     * to the wallet policy.
     */
    static LocalDateTime[] currentMonthWindow() {
        return currentMonthWindow(LocalDateTime.now());
    }

    /** Test seam — accepts a clock value so tests don't race the calendar boundary. */
    static LocalDateTime[] currentMonthWindow(LocalDateTime now) {
        YearMonth ym = YearMonth.from(now);
        LocalDateTime start = ym.atDay(1).atStartOfDay();
        LocalDateTime end = ym.plusMonths(1).atDay(1).atStartOfDay();
        return new LocalDateTime[] {start, end};
    }

    /** Snapshot for an anonymous / null-team request — never billable, never degraded. */
    public static EntitlementSnapshot anonymousFull() {
        LocalDateTime[] w = currentMonthWindow();
        return new EntitlementSnapshot(
                EntitlementState.FULL,
                FeatureSet.FULL,
                List.of(
                        FeatureGate.OFFSITE_PROCESSING,
                        FeatureGate.AUTOMATION,
                        FeatureGate.AI_SUPPORT,
                        FeatureGate.CLIENT_SIDE),
                0L,
                null,
                w[0],
                w[1]);
    }
}
