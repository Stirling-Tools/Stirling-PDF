package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.billing.BillingCategory;

/**
 * Accrues a linked team's metered usage into the durable per-(period, category) {@link
 * UsageCounter}; the daily sync later reports the cumulative totals to SaaS. The cloud ledger only
 * — an unlinked instance meters its own grant through {@link FreeTierUsageService}.
 *
 * <p>Dedup follows the shared {@link MeteredInputWindow} rule. Fileless ops pass a null signature
 * and always accrue. {@link #accrue} is best-effort: callers need not handle persistence errors.
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
        if (opSignature != null && !inputWindow.shouldCharge(periodStart, opSignature)) {
            return; // identical inputs seen within the workflow window — chaining, already billed
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
