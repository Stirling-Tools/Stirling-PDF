package stirling.software.proprietary.accountlink;

import java.time.Duration;
import java.time.LocalDateTime;

import org.springframework.dao.DataIntegrityViolationException;

import lombok.extern.slf4j.Slf4j;

/**
 * The workflow-window dedup rule, shared by both meters so an op costs the same either way. An
 * identical input set inside {@code metering.workflow-window} is chaining, not a new charge.
 *
 * <p>Not a bean: each meter constructs one, so the rule cannot be on for one ledger and off for the
 * other. {@link MeteredInputSignature} rows are shared, so callers namespace their own.
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
     * Charge when unseen this period, or last seen outside the window. Records a first sighting as
     * an atomic insert-as-claim, and fails toward charging so a store hiccup drops nothing.
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
