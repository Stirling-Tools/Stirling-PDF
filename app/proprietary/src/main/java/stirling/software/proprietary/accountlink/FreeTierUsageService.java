package stirling.software.proprietary.accountlink;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
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
 * The local free-tier ledger an unlinked instance meters itself against.
 *
 * <p>Touches only {@link FreeTierUsageCounter} / {@link FreeTierPeriod}, which {@link
 * UsageSyncService} never reads, so local usage never reaches SaaS and a link/unlink cycle cannot
 * mint a fresh grant.
 */
@Slf4j
@Service
@Profile("!saas")
@ConditionalOnProperty(
        name = "stirling.billing.account-link.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class FreeTierUsageService {

    /** Disjoint from the cloud meter's keyspace: the two period starts can collide. */
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

    /** Lets tests drive the period boundary rather than wait a month. */
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

    /** {@code remainingUnits} is floored at 0 and is what the gate enforces; end is exclusive. */
    public record FreeTierBalance(
            long grantUnits,
            long usedUnits,
            long remainingUnits,
            LocalDateTime periodStart,
            LocalDateTime periodEnd,
            Map<String, Long> usedByCategory) {

        public FreeTierBalance(
                long grantUnits,
                long usedUnits,
                long remainingUnits,
                LocalDateTime periodStart,
                LocalDateTime periodEnd) {
            this(grantUnits, usedUnits, remainingUnits, periodStart, periodEnd, Map.of());
        }
    }

    public FreeTierBalance balance() {
        PeriodWindow window = currentPeriod();
        Map<String, Long> byCategory = new LinkedHashMap<>();
        long spent = 0;
        for (Object[] row : counters.sumUnitsByCategory(window.start())) {
            long units = row[1] == null ? 0L : ((Number) row[1]).longValue();
            byCategory.put(String.valueOf(row[0]), units);
            spent += units;
        }
        return new FreeTierBalance(
                grantUnits,
                spent,
                Math.max(0, grantUnits - spent),
                window.start(),
                window.end(),
                Map.copyOf(byCategory));
    }

    /**
     * Spends against the current period unless {@code opSignature} was already charged inside the
     * workflow window. Best-effort: callers need not handle persistence errors.
     */
    public void accrue(BillingCategory category, long units, String opSignature) {
        if (category == null || category == BillingCategory.BYPASSED || units <= 0) {
            return;
        }
        LocalDateTime period;
        try {
            period = currentPeriodStart();
        } catch (RuntimeException e) {
            // No period, no key to accrue under. The same fault fails the gate open, so both
            // err toward the user rather than charging ungated work.
            log.debug("Free-tier period unavailable; skipping accrual: {}", e.getMessage());
            return;
        }
        if (opSignature != null && !inputWindow.shouldCharge(period, namespaced(opSignature))) {
            return;
        }
        incrementOrInsert(period, category.name(), units);
    }

    /** Start inclusive, end exclusive; both whole month counts from the same immutable anchor. */
    record PeriodWindow(LocalDateTime start, LocalDateTime end) {}

    LocalDateTime currentPeriodStart() {
        return currentPeriod().start();
    }

    /**
     * The period in force, anchoring on first use and rolling the stamp when the boundary has
     * passed. Every bound is a whole month count from the immutable anchor, so neither drifts and
     * the end reported to the UI is the one enforcement rolls on. Deriving the end from the
     * <em>start</em> would report an earlier reset than the gate honours whenever the anchor day
     * clamps: a 31st anchor starts February on the 28th, whose next month is the 28th of March,
     * while the gate holds until the 31st.
     */
    PeriodWindow currentPeriod() {
        LocalDateTime now = clock.get();
        FreeTierPeriod stored = periods.findById(FreeTierPeriod.SINGLETON_ID).orElse(null);
        if (stored == null) {
            LocalDateTime first = anchorNow(now);
            return new PeriodWindow(first, first.plusMonths(1));
        }
        LocalDateTime anchor = stored.getAnchorAt();
        long elapsed = periodsElapsed(anchor, now);
        LocalDateTime start = anchor.plusMonths(elapsed);
        if (start.isAfter(stored.getPeriodStart())) {
            periods.rollTo(FreeTierPeriod.SINGLETON_ID, start, now);
        }
        return new PeriodWindow(start, anchor.plusMonths(elapsed + 1));
    }

    /**
     * Largest {@code n} with {@code anchor.plusMonths(n) <= now}.
     *
     * <p>{@link ChronoUnit#MONTHS} alone is not that number: it disagrees with {@code plusMonths}
     * when the anchor day clamps into a shorter month, so a 31st anchor reads as 0 elapsed long
     * after the first period ended. The clamp costs at most a month, so neither loop repeats.
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

    /**
     * Anchors the first period at {@code now}; a concurrent first request wins or loses cleanly.
     */
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
