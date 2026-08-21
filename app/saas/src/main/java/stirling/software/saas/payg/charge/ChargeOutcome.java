package stirling.software.saas.payg.charge;

import java.util.UUID;

/**
 * Result of {@link JobChargeService#openProcess}. {@code processId} is the job the caller's tool
 * call belongs to (newly opened or joined). {@code units} is what would have been debited had the
 * call been in PAYG (live) mode — for OPENED, the actual classification × policy units; for JOINED,
 * always 0 since the parent process already paid.
 */
public record ChargeOutcome(UUID processId, int units, Disposition disposition) {

    public enum Disposition {
        /** Started a new process; {@code units} reflects the would-be charge. */
        OPENED,
        /** Joined an existing process within window; no incremental charge. */
        JOINED
    }
}
