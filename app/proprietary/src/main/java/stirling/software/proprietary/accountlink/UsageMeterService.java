package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.billing.BillingCategory;
import stirling.software.proprietary.billing.BillingStepLimit;

/**
 * Accrues a linked team's metered usage into the durable per-(period, category) {@link
 * UsageCounter}; the daily sync later reports the cumulative totals to SaaS. The cloud ledger only
 * — an unlinked instance meters its own grant through {@link FreeTierUsageService}.
 *
 * <p>A run/document key groups successful sub-steps until the configured step limit or workflow
 * window is reached. Standalone calls have no key and always accrue. Persistence failures are
 * logged and never affect the completed operation's response.
 */
@Slf4j
@Service
@Profile("!saas")
@ConditionalOnProperty(
        name = "stirling.billing.account-link.metering.enabled",
        havingValue = "true")
public class UsageMeterService {

    private final UsageCounterRepository repo;
    private final MeteredInputWindow inputWindow;

    public UsageMeterService(
            UsageCounterRepository repo,
            MeteredInputSignatureRepository signatureRepo,
            AccountLinkProperties properties) {
        this.repo = repo;
        this.inputWindow =
                new MeteredInputWindow(signatureRepo, properties.getMetering().getWorkflowWindow());
    }

    /**
     * Records successful work using the default step limit. A null key always charges; a
     * run/document key groups steps within that limit and the workflow window.
     */
    public void accrue(
            LocalDateTime periodStart, BillingCategory category, long units, String dedupKey) {
        accrue(periodStart, category, units, dedupKey, BillingStepLimit.resolve(null));
    }

    /**
     * Records one successful step. Charges its current input units on the first step, after {@code
     * stepLimit} successful steps, or after the workflow window expires. Each key counts
     * independently; a null key always charges. Missing periods, non-billable categories and
     * non-positive units are ignored. Callers must not report failed steps.
     */
    public void accrue(
            LocalDateTime periodStart,
            BillingCategory category,
            long units,
            String dedupKey,
            int stepLimit) {
        if (periodStart == null
                || category == null
                || category == BillingCategory.BYPASSED
                || units <= 0) {
            return;
        }
        if (dedupKey != null
                && !inputWindow.shouldCharge(
                        periodStart, dedupKey, BillingStepLimit.resolve(stepLimit))) {
            return;
        }
        incrementOrInsert(periodStart, category.name(), units);
    }

    private void incrementOrInsert(LocalDateTime periodStart, String category, long units) {
        LocalDateTime now = LocalDateTime.now();
        try {
            if (repo.increment(periodStart, category, units, now) > 0) {
                return;
            }
            try {
                repo.saveAndFlush(new UsageCounter(periodStart, category, units, now));
            } catch (DataIntegrityViolationException raceLostInsert) {
                // A concurrent request inserted the row first — increment the now-existing row.
                repo.increment(periodStart, category, units, now);
            }
        } catch (RuntimeException e) {
            // Metering must never break the request it rode in on; a lost accrual self-heals on the
            // next increment and the daily sync reports the cumulative total either way.
            log.debug("Usage accrual failed for {}/{}: {}", periodStart, category, e.getMessage());
        }
    }
}
