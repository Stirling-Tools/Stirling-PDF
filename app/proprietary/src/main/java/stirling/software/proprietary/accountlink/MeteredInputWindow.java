package stirling.software.proprietary.accountlink;

import java.time.Duration;
import java.time.LocalDateTime;

import org.springframework.dao.DataIntegrityViolationException;

import lombok.extern.slf4j.Slf4j;

/**
 * Groups successful steps by run/document key until the step limit or workflow window is reached.
 * Both ledgers share this rule; callers namespace keys to keep free-tier and cloud usage separate.
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
     * Records one successful step and returns whether it starts a charge. Concurrent completions
     * share the persisted allowance; persistence errors fail toward charging.
     */
    boolean shouldCharge(LocalDateTime periodStart, String dedupKey, int stepLimit) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime cutoff = now.minus(window);
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
}
