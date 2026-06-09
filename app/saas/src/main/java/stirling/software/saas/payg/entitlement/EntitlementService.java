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

import stirling.software.saas.payg.cap.CapEvaluator;
import stirling.software.saas.payg.cap.CapEvaluator.Evaluation;
import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.FeatureSet;
import stirling.software.saas.payg.model.LedgerEntryType;
import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.repository.WalletLedgerRepository;
import stirling.software.saas.payg.repository.WalletPolicyRepository;
import stirling.software.saas.payg.wallet.WalletPolicy;

/**
 * Hot-path entitlement lookup. Returns the {@link EntitlementSnapshot} for a team, computed from
 * the team's subscription state (subscribed → {@code wallet_policy.cap_units}; un-subscribed →
 * free-tier units per cycle) and the team's current-period spend in the ledger.
 *
 * <p>Backed by a per-team Caffeine cache with {@value #CACHE_TTL_SECONDS}s TTL and {@value
 * #CACHE_MAX_SIZE}-entry cap. The TTL is the correctness floor — a cap change becomes visible on
 * every instance within that window without coordination. Mutators (wallet policy admin updates,
 * subscription webhook handlers) call {@link #invalidate(Long)} to drop a single team's entry
 * immediately on the originating instance.
 *
 * <p><b>Dependencies not on this branch (PR #6532):</b> the snapshot ideally reads {@code
 * pricing_policy.free_tier_units_per_cycle} and {@code payg_team_extensions.payg_subscription_id}.
 * Locally we fall back to {@value #DEFAULT_FREE_TIER_UNITS} units / cycle for teams without a
 * wallet policy, which preserves the "MINIMAL once over the cap" behaviour the guard relies on.
 * Once PR #6532 lands and those columns exist, the {@link #resolveCapUnits} branch should switch to
 * reading {@code freeTierUnitsPerCycle} when {@code paygSubscriptionId} is null.
 */
@Slf4j
@Service
@Profile("saas")
public class EntitlementService {

    static final int CACHE_TTL_SECONDS = 30;
    private static final int CACHE_MAX_SIZE = 10_000;

    /**
     * Default free-tier cap used when no {@code wallet_policy} row exists for the team and the
     * {@code free_tier_units_per_cycle} column isn't available yet (pre-#6532 local schema). Keeps
     * un-subscribed teams gated on a sensible default rather than uncapped.
     */
    static final long DEFAULT_FREE_TIER_UNITS = 500L;

    private static final int WARN_AT_PCT = 80;
    private static final int DEGRADE_AT_PCT = 100;

    private final PaygTeamExtensionsRepository teamExtensionsRepository;
    private final WalletPolicyRepository walletPolicyRepository;
    private final WalletLedgerRepository ledgerRepository;

    private final Cache<Long, EntitlementSnapshot> snapshotCache;

    public EntitlementService(
            PaygTeamExtensionsRepository teamExtensionsRepository,
            WalletPolicyRepository walletPolicyRepository,
            WalletLedgerRepository ledgerRepository) {
        this.teamExtensionsRepository =
                Objects.requireNonNull(teamExtensionsRepository, "teamExtensionsRepository");
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
     * waiting out the TTL.
     */
    public void invalidate(Long teamId) {
        if (teamId != null) {
            snapshotCache.invalidate(teamId);
        }
    }

    /** Visible for tests. */
    long cacheSize() {
        return snapshotCache.estimatedSize();
    }

    @Transactional(readOnly = true)
    EntitlementSnapshot computeSnapshot(Long teamId) {
        Optional<PaygTeamExtensions> extensionsOpt = teamExtensionsRepository.findById(teamId);
        Optional<WalletPolicy> walletPolicyOpt = walletPolicyRepository.findByTeamId(teamId);

        Long capUnits = resolveCapUnits(extensionsOpt, walletPolicyOpt);
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

        LocalDateTime[] window = currentMonthWindow();
        LocalDateTime periodStart = window[0];
        LocalDateTime periodEnd = window[1];

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
     * Resolve the period cap.
     *
     * <p>Target design (once PR #6532 lands):
     *
     * <ul>
     *   <li>{@code paygSubscriptionId != null} → {@code wallet_policy.cap_units}.
     *   <li>{@code paygSubscriptionId == null} → {@code pricing_policy.free_tier_units_per_cycle}.
     * </ul>
     *
     * <p>Current branch (pre-#6532) doesn't have {@code paygSubscriptionId} or {@code
     * freeTierUnitsPerCycle} columns. Fallback rule:
     *
     * <ul>
     *   <li>{@code wallet_policy} present → its {@code cap_units} (may be null → uncapped, which
     *       matches the "no cap configured" semantics of {@link CapEvaluator}).
     *   <li>{@code wallet_policy} absent → {@link #DEFAULT_FREE_TIER_UNITS} units / cycle.
     * </ul>
     */
    private Long resolveCapUnits(
            Optional<PaygTeamExtensions> extensions, Optional<WalletPolicy> walletPolicy) {
        // Suppress unused-variable warning until #6532 lands and we read paygSubscriptionId here.
        if (extensions.isPresent()) {
            // Intentionally read but unused: keep the lookup so the SELECT happens (warms team
            // extensions caches the rest of the request path needs) and document where the
            // post-#6532 branch will live.
        }
        if (walletPolicy.isPresent()) {
            return walletPolicy.get().getCapUnits();
        }
        return DEFAULT_FREE_TIER_UNITS;
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
