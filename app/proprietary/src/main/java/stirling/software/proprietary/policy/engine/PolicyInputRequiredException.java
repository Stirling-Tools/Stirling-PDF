package stirling.software.proprietary.policy.engine;

import java.util.List;

import org.springframework.core.io.Resource;

import lombok.Getter;

/**
 * Thrown by a step to signal that the run cannot proceed without further user input, pausing the
 * run in {@code WAITING_FOR_INPUT} rather than failing it.
 *
 * <p>Carries everything needed to resume: a human-readable reason, the 0-based index of the step to
 * resume from, and the intermediate files produced so far. The engine persists those files and
 * suspends the run.
 *
 * <p>Defined now to fix the run shape; no step throws it yet, and the resume handshake is
 * implemented in a later stage.
 */
@Getter
public class PolicyInputRequiredException extends RuntimeException {

    private final transient List<Resource> pendingFiles;
    private final int resumeStepIndex;

    public PolicyInputRequiredException(
            String reason, int resumeStepIndex, List<Resource> pendingFiles) {
        super(reason);
        this.resumeStepIndex = resumeStepIndex;
        this.pendingFiles = pendingFiles == null ? List.of() : pendingFiles;
    }
}
