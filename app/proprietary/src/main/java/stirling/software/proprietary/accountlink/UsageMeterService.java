package stirling.software.proprietary.accountlink;

import java.time.Duration;
import java.time.LocalDateTime;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.billing.BillingCategory;

/**
 * Accrues metered usage into the durable per-(period, category) {@link UsageCounter}; the daily
 * sync later reports the cumulative totals to SaaS.
 *
 * <p>Workflow-window dedup: an identical input set re-submitted within {@code metering.workflow-
 * window} is treated as chaining and not re-charged; the same inputs run again after the window are
 * billed afresh — matching the cloud's open-job lineage window so the same op costs the same on the
 * instance and in the cloud. Fileless ops pass a null signature and always accrue. {@link #accrue}
 * is best-effort: callers need not handle persistence errors.
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
     * Adds {@code units} to the {@code (periodStart, category)} counter (creating the row on first
     * use), unless {@code opSignature} was already metered this period. No-ops for non-billable
     * categories, non-positive units, or a missing period.
     */
    public void accrue(
            LocalDateTime periodStart, BillingCategory category, long units, String opSignature) {
        if (periodStart == null
                || category == null
                || category == BillingCategory.BYPASSED
                || units <= 0) {
            return;
        }
        if (opSignature != null && !shouldCharge(periodStart, opSignature)) {
            return; // identical inputs seen within the workflow window — chaining, already billed
        }
        incrementOrInsert(periodStart, category.name(), units);
    }

    /**
     * True when this input set should be charged: unseen this period, or last seen outside the
     * workflow window. Records a first sighting (an atomic insert-as-claim under concurrency) and
     * slides the window on a repeat. Fails toward charging so a store hiccup never drops a charge.
     */
    private boolean shouldCharge(LocalDateTime periodStart, String opSignature) {
        LocalDateTime now = LocalDateTime.now();
        MeteredInputSignature seen =
                signatureRepo.findByPeriodStartAndSignature(periodStart, opSignature).orElse(null);
        if (seen == null) {
            try {
                signatureRepo.saveAndFlush(
                        new MeteredInputSignature(periodStart, opSignature, now));
                return true; // first sighting this period
            } catch (DataIntegrityViolationException raced) {
                return false; // a concurrent op just claimed it — within window → chaining
            } catch (RuntimeException e) {
                log.debug("Signature claim failed for {}: {}", periodStart, e.getMessage());
                return true;
            }
        }
        LocalDateTime last = seen.getLastMeteredAt() != null ? seen.getLastMeteredAt() : now;
        boolean withinWindow = last.isAfter(now.minus(workflowWindow));
        try {
            seen.touch(now);
            signatureRepo.save(seen);
        } catch (RuntimeException e) {
            log.debug("Signature touch failed for {}: {}", periodStart, e.getMessage());
        }
        return !withinWindow;
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
