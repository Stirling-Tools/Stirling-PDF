package stirling.software.proprietary.policy.engine;

import java.util.List;

import org.springframework.core.io.Resource;

import lombok.Getter;

/**
 * Thrown by a step that needs further user input, pausing the run in {@code WAITING_FOR_INPUT}
 * instead of failing. Carries the resume reason, 0-based resume step index, and intermediate files;
 * the engine persists those and suspends. Not yet thrown by any step.
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
