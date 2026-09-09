package stirling.software.proprietary.accountlink;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.billing.BillingCategory;
import stirling.software.proprietary.billing.ContentHasher;

/**
 * The whole local free-tier ledger: the instance's own monthly period, the units spent against the
 * grant in it, and the accrual that spends them. This is what an instance that has never linked to
 * a Stirling account meters itself against, so no account is needed to use the free tier.
 *
 * <p>Independent of the cloud wallet by construction. It reads and writes only {@link
 * FreeTierUsageCounter} / {@link FreeTierPeriod}, which {@link UsageSyncService} never touches, so
 * local usage is never reported to SaaS and survives a link/unlink cycle untouched — relinking
 * cannot mint a fresh grant. While the instance is linked the cloud wallet is authoritative and
 * this ledger simply stops being written or read (see {@link InstanceEntitlementGate#evaluate}).
 *
 * <p>The balance is derived from the counters rather than stored: the counters already hold the
 * period's authoritative total, a second number would be free to drift from them, and derivation is
 * what makes the monthly reset free — a new period has no counter rows, so it reads as a full grant
 * with nothing to zero. Unlike the cloud there is no refund path to credit back.
 */
@Slf4j
@Service
@Profile("!saas")
@ConditionalOnProperty(
        name = "stirling.billing.account-link.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class FreeTierUsageService {

    /**
     * Keeps the shared {@link MeteredInputSignature} keyspace disjoint from the cloud meter's, so a
     * signature claimed before linking can never suppress a charge after it (a locally-anchored
     * period start and a Stripe one can be the same timestamp).
     */
    private static final String SIGNATURE_NAMESPACE = "free-tier\n";

    private final FreeTierPeriodRepository periods;
    private final FreeTierUsageCounterRepository counters;
    private final MeteredInputWindow inputWindow;
    private final long grantUnits;
    private final Supplier<LocalDateTime> clock;

    @Autowired
    public FreeTierUsageService(
            FreeTierPeriodRepository periods,
            FreeTierUsageCounterRepository counters,
            MeteredInputSignatureRepository signatures,
            AccountLinkProperties properties) {
        this(periods, counters, signatures, properties, LocalDateTime::now);
    }

    /** Package-private: lets tests drive the period boundary instead of waiting a month for it. */
    FreeTierUsageService(
            FreeTierPeriodRepository periods,
            FreeTierUsageCounterRepository counters,
            MeteredInputSignatureRepository signatures,
            AccountLinkProperties properties,
            Supplier<LocalDateTime> clock) {
        this.periods = periods;
        this.counters = counters;
        this.inputWindow =
                new MeteredInputWindow(signatures, properties.getMetering().getWorkflowWindow());
        this.grantUnits = properties.getFreeTierUnits();
        this.clock = clock;
    }

    /**
     * What the instance may still spend for free this month. {@code remainingUnits} is floored at 0
     * and is the number the gate enforces; {@code periodEnd} is exclusive.
     */
    public record FreeTierBalance(
            long grantUnits,
            long usedUnits,
            long remainingUnits,
            LocalDateTime periodStart,
            LocalDateTime periodEnd) {}

    public FreeTierBalance balance() {
        LocalDateTime start = currentPeriodStart();
        Long used = counters.sumUnits(start);
        long spent = used != null ? used : 0L;
        return new FreeTierBalance(
                grantUnits, spent, Math.max(0, grantUnits - spent), start, start.plusMonths(1));
    }

    /**
     * Spends {@code units} of the grant against the current period, unless {@code opSignature} was
     * already metered inside the workflow window. No-ops for non-billable categories or
     * non-positive units. Best-effort: callers need not handle persistence errors.
     */
    public void accrue(BillingCategory category, long units, String opSignature) {
        if (category == null || category == BillingCategory.BYPASSED || units <= 0) {
            return;
        }
        LocalDateTime period;
        try {
            period = currentPeriodStart();
        } catch (RuntimeException e) {
            // No period means no key to accrue under. Dropping the accrual is the safe direction:
            // the same fault would make the gate fail open, so the two agree on erring toward the
            // user rather than charging work that was never gated.
            log.debug("Free-tier period unavailable; skipping accrual: {}", e.getMessage());
            return;
        }
        if (opSignature != null && !inputWindow.shouldCharge(period, namespaced(opSignature))) {
            return;
        }
        incrementOrInsert(period, category.name(), units);
    }

    /**
     * The period in force, creating the anchor on first use and rolling the stored stamp forward
     * when the boundary has passed. Every start is a whole number of months from the immutable
     * anchor, so the stamp can be recomputed at any time and cannot drift.
     */
    LocalDateTime currentPeriodStart() {
        LocalDateTime now = clock.get();
        FreeTierPeriod stored = periods.findById(FreeTierPeriod.SINGLETON_ID).orElse(null);
        if (stored == null) {
            return anchorNow(now);
        }
        LocalDateTime anchor = stored.getAnchorAt();
        LocalDateTime start = anchor.plusMonths(periodsElapsed(anchor, now));
        if (start.isAfter(stored.getPeriodStart())) {
            periods.rollTo(FreeTierPeriod.SINGLETON_ID, start, now);
        }
        return start;
    }

    /**
     * Whole periods elapsed: the largest {@code n} with {@code anchor.plusMonths(n) <= now}.
     *
     * <p>{@link ChronoUnit#MONTHS} alone is not that number, because it disagrees with {@link
     * LocalDateTime#plusMonths} whenever the anchor day has to be clamped into a shorter month — a
     * 31st anchor reads as 0 months elapsed well after {@code plusMonths(1)} has already passed,
     * which would strand such an instance in its first period. The correction is bounded: the clamp
     * costs at most one month, so neither loop runs more than once.
     */
    private static long periodsElapsed(LocalDateTime anchor, LocalDateTime now) {
        long n = Math.max(0, ChronoUnit.MONTHS.between(anchor, now));
        while (!anchor.plusMonths(n + 1).isAfter(now)) {
            n++;
        }
        while (n > 0 && anchor.plusMonths(n).isAfter(now)) {
            n--;
        }
        return n;
    }

    /** Anchors the first period at {@code now}, tolerating a concurrent first request. */
    private LocalDateTime anchorNow(LocalDateTime now) {
        try {
            return periods.saveAndFlush(new FreeTierPeriod(now)).getPeriodStart();
        } catch (DataIntegrityViolationException raced) {
            return periods.findById(FreeTierPeriod.SINGLETON_ID)
                    .map(FreeTierPeriod::getPeriodStart)
                    .orElse(now);
        }
    }

    private void incrementOrInsert(LocalDateTime period, String category, long units) {
        LocalDateTime now = clock.get();
        try {
            if (counters.increment(period, category, units, now) > 0) {
                return;
            }
            try {
                counters.saveAndFlush(new FreeTierUsageCounter(period, category, units, now));
            } catch (DataIntegrityViolationException raceLostInsert) {
                counters.increment(period, category, units, now);
            }
        } catch (RuntimeException e) {
            // Metering must never break the request it rode in on; the next accrual self-heals.
            log.debug("Free-tier accrual failed for {}/{}: {}", period, category, e.getMessage());
        }
    }

    private static String namespaced(String opSignature) {
        // Re-hashed rather than prefixed: the signature column holds exactly one SHA-256 hex.
        return ContentHasher.sha256(
                (SIGNATURE_NAMESPACE + opSignature).getBytes(StandardCharsets.UTF_8));
    }
}
