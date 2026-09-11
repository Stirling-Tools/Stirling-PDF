package stirling.software.proprietary.accountlink;

import java.time.Duration;
import java.time.LocalDateTime;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.billing.BillingCategory;
import stirling.software.proprietary.billing.BillingStepLimit;

/**
 * Accrues metered usage into the durable per-(period, category) {@link UsageCounter}; the daily
 * sync later reports the cumulative totals to SaaS.
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
    private final MeteredInputSignatureRepository signatureRepo;
    private final Duration workflowWindow;

    public UsageMeterService(
            UsageCounterRepository repo,
            MeteredInputSignatureRepository signatureRepo,
            AccountLinkProperties properties) {
        this.repo = repo;
        this.signatureRepo = signatureRepo;
        this.workflowWindow = properties.getMetering().getWorkflowWindow();
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
                && !shouldCharge(periodStart, dedupKey, BillingStepLimit.resolve(stepLimit))) {
            return;
        }
        incrementOrInsert(periodStart, category.name(), units);
    }

    private boolean shouldCharge(LocalDateTime periodStart, String dedupKey, int stepLimit) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime cutoff = now.minus(workflowWindow);
        try {
            while (true) {
                if (signatureRepo.restartIfFullOrExpired(
                                periodStart, dedupKey, now, cutoff, stepLimit)
                        > 0) {
                    return true;
                }
                if (signatureRepo.joinIfWithinLimit(periodStart, dedupKey, now, cutoff, stepLimit)
                        > 0) {
                    return false;
                }
                try {
                    signatureRepo.saveAndFlush(
                            new MeteredInputSignature(periodStart, dedupKey, now));
                    return true;
                } catch (DataIntegrityViolationException raced) {
                    // Another completion inserted or filled this key between the conditional
                    // updates. Retry so this successful step still counts toward the limit.
                    if (signatureRepo
                            .findByPeriodStartAndSignature(periodStart, dedupKey)
                            .isEmpty()) {
                        throw raced;
                    }
                }
            }
        } catch (RuntimeException e) {
            log.debug("Step counting failed for {}: {}", periodStart, e.getMessage());
            return true;
        }
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
