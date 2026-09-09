package stirling.software.saas.payg.bundle;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Draws down and restores prepaid unit pools ({@link PrepaidBundle}). Sits between the free grant
 * and the meter in the charge pipeline (free → prepaid → metered): a charge first spends the team's
 * free grant, then this service spends prepaid pools FIFO by soonest expiry, and only the remainder
 * meters to Stripe / counts against the cap.
 *
 * <p>Methods participate in the caller's transaction (default REQUIRED propagation), so the draw's
 * pessimistic write lock is held for the whole {@code openProcess} transaction — the same
 * discipline as the free-grant deduction, so concurrent same-team charges can't both spend the last
 * unit.
 */
@Service
@Profile("saas")
@RequiredArgsConstructor
@Slf4j
public class PrepaidBundleService {

    private final PrepaidBundleRepository bundleRepository;

    /**
     * Spend up to {@code units} from the team's drawable pools, earliest-expiring first, returning
     * how many were actually drawn (0..{@code units}). Pools past their term are skipped (lazy
     * expiry — the {@code expires_at} filter means an expired pool is never drawn even before the
     * expiry sweep runs). A partial draw is normal: the remainder meters.
     */
    @Transactional
    public int draw(Long teamId, int units) {
        if (teamId == null || units <= 0) {
            return 0;
        }
        List<PrepaidBundle> pools =
                bundleRepository.findDrawableForUpdate(teamId, LocalDateTime.now());
        int remaining = units;
        int drawn = 0;
        for (PrepaidBundle pool : pools) {
            if (remaining <= 0) {
                break;
            }
            long take = Math.min(remaining, pool.getUnitsRemaining());
            if (take <= 0) {
                continue;
            }
            pool.setUnitsRemaining(pool.getUnitsRemaining() - take);
            drawn += (int) take;
            remaining -= (int) take;
        }
        if (drawn > 0) {
            bundleRepository.saveAll(pools);
        }
        return drawn;
    }

    /**
     * Return {@code units} to the team's in-term pools on a refund, earliest-expiring first,
     * capping each pool at its original {@code units_total}. Best-effort: units that can't be
     * placed (all in-term pools already at capacity, or every pool expired in the tiny window since
     * the draw) are dropped with a debug log — first-step-failure refunds are effectively
     * immediate, so in practice the drawn-from pools are still open and take the units straight
     * back.
     */
    @Transactional
    public int restore(Long teamId, int units) {
        if (teamId == null || units <= 0) {
            return 0;
        }
        List<PrepaidBundle> pools =
                bundleRepository.findInTermForUpdate(teamId, LocalDateTime.now());
        int remaining = units;
        for (PrepaidBundle pool : pools) {
            if (remaining <= 0) {
                break;
            }
            long headroom = pool.getUnitsTotal() - pool.getUnitsRemaining();
            if (headroom <= 0) {
                continue;
            }
            long give = Math.min(remaining, headroom);
            pool.setUnitsRemaining(pool.getUnitsRemaining() + give);
            remaining -= (int) give;
        }
        int restored = units - remaining;
        if (restored > 0) {
            bundleRepository.saveAll(pools);
        }
        if (remaining > 0) {
            log.debug(
                    "restore: {} of {} prepaid units couldn't be placed for team {} (no in-term"
                            + " headroom)",
                    remaining,
                    units,
                    teamId);
        }
        return restored;
    }

    /**
     * Aggregate a team's in-term pools for the wallet snapshot: total remaining + total capacity +
     * soonest expiry. Includes exhausted-but-in-term pools so the "X of Y used" meter keeps the
     * right denominator for the term. Returns {@code null} when the team has no in-term bundle.
     */
    @Transactional(readOnly = true)
    public PrepaidSummary summarize(Long teamId) {
        if (teamId == null) {
            return null;
        }
        List<PrepaidBundle> pools = bundleRepository.findInTerm(teamId, LocalDateTime.now());
        if (pools.isEmpty()) {
            return null;
        }
        long remaining = 0L;
        long total = 0L;
        LocalDateTime soonest = null;
        for (PrepaidBundle pool : pools) {
            remaining += pool.getUnitsRemaining();
            total += pool.getUnitsTotal();
            if (soonest == null || pool.getExpiresAt().isBefore(soonest)) {
                soonest = pool.getExpiresAt();
            }
        }
        return new PrepaidSummary(remaining, total, soonest);
    }

    /**
     * Total prepaid units a team can still draw right now (in-term pools only); 0 when it has none.
     * The entitlement gate uses this so a team with a live prepaid pool stays entitled even without
     * a metered subscription — paid-for capacity is usable on its own merit.
     */
    @Transactional(readOnly = true)
    public long prepaidRemainingUnits(Long teamId) {
        PrepaidSummary summary = summarize(teamId);
        return summary == null ? 0L : summary.unitsRemaining();
    }

    /** Aggregated prepaid balance for a team's in-term pools. */
    public record PrepaidSummary(long unitsRemaining, long unitsTotal, LocalDateTime expiresAt) {}
}
