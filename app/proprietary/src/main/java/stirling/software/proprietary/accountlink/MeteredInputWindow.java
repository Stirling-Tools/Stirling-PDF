package stirling.software.proprietary.accountlink;

import java.time.Duration;
import java.time.LocalDateTime;

import org.springframework.dao.DataIntegrityViolationException;

import lombok.extern.slf4j.Slf4j;

/**
 * The workflow-window dedup rule, shared by both meters so an operation costs the same whichever
 * ledger it lands in. An identical input set re-submitted within {@code metering.workflow-window}
 * is treated as chaining and not re-charged; the same inputs run again after the window are billed
 * afresh — matching the cloud's open-job lineage window.
 *
 * <p>Plain object, not a bean: each meter constructs one so the rule can't be switched on for one
 * ledger and off for the other. Callers namespace their own signatures ({@link
 * MeteredInputSignature} rows are shared), and must pass their own period stamp.
 */
@Slf4j
class MeteredInputWindow {

    private final MeteredInputSignatureRepository signatureRepo;
    private final Duration window;

    MeteredInputWindow(MeteredInputSignatureRepository signatureRepo, Duration window) {
        this.signatureRepo = signatureRepo;
        this.window = window;
    }

    /**
     * True when this input set should be charged: unseen this period, or last seen outside the
     * window. Records a first sighting (an atomic insert-as-claim under concurrency) and slides the
     * window on a repeat. Fails toward charging so a store hiccup never drops a charge.
     */
    boolean shouldCharge(LocalDateTime periodStart, String opSignature) {
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
        boolean withinWindow = last.isAfter(now.minus(window));
        try {
            seen.touch(now);
            signatureRepo.save(seen);
        } catch (RuntimeException e) {
            log.debug("Signature touch failed for {}: {}", periodStart, e.getMessage());
        }
        return !withinWindow;
    }
}
