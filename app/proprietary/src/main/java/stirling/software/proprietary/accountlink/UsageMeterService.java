package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.billing.BillingCategory;

/**
 * Accrues metered usage into the durable per-(period, category) {@link UsageCounter} on the
 * instance. The daily sync later reports the cumulative totals to SaaS.
 *
 * <p>Lineage dedup: a billable op carries an {@code opSignature} (a hash of its input set). Before
 * accruing, the meter <b>claims</b> that signature for the period — a re-submission of the
 * identical inputs finds it already claimed and is not re-charged, the instance-local equivalent of
 * the cloud's lineage join (so the same op costs the same on the instance and in the cloud).
 * Fileless ops pass a null signature and always accrue (no input identity to dedup on).
 *
 * <p>Gated behind the dedicated {@code stirling.billing.account-link.metering.enabled} switch (on
 * top of {@code @Profile("!saas")}), so the bean is absent — and nothing accrues — unless billing
 * is explicitly turned on. {@link #accrue} is best-effort and self-contained: callers (the gate
 * interceptor's success path) need not handle persistence errors.
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

    public UsageMeterService(
            UsageCounterRepository repo, MeteredInputSignatureRepository signatureRepo) {
        this.repo = repo;
        this.signatureRepo = signatureRepo;
    }

    /**
     * Adds {@code units} to the {@code (periodStart, category)} counter, creating the row on first
     * use, unless {@code opSignature} (the op's input-set hash) was already metered this period — a
     * re-submission of identical inputs, which is skipped. No-ops for non-billable categories,
     * non-positive units, or a missing period (e.g. entitlement not yet synced).
     */
    public void accrue(
            LocalDateTime periodStart, BillingCategory category, long units, String opSignature) {
        if (periodStart == null
                || category == null
                || category == BillingCategory.BYPASSED
                || units <= 0) {
            return;
        }
        // Claim the input-set signature first (insert-as-claim): if it already exists this is a
        // re-submission already billed — skip. Claiming before incrementing means the rare failure
        // mode is a missed accrual (self-favouring), never a double-charge.
        if (opSignature != null && !claimSignature(periodStart, opSignature)) {
            return;
        }
        incrementOrInsert(periodStart, category.name(), units);
    }

    private boolean claimSignature(LocalDateTime periodStart, String opSignature) {
        try {
            signatureRepo.saveAndFlush(
                    new MeteredInputSignature(periodStart, opSignature, LocalDateTime.now()));
            return true;
        } catch (DataIntegrityViolationException alreadyMetered) {
            return false; // same input set already billed this period
        } catch (RuntimeException e) {
            // Never let a dedup-store hiccup drop a charge; treat as "not a duplicate" and accrue.
            log.debug("Signature claim failed for {}: {}", periodStart, e.getMessage());
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
            // Metering must never break the request it rode in on; lost accrual self-heals on the
            // next operation's increment, and the daily sync reports the cumulative total either
            // way.
            log.debug("Usage accrual failed for {}/{}: {}", periodStart, category, e.getMessage());
        }
    }
}
