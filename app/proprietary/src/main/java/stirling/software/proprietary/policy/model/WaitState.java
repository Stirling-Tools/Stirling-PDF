package stirling.software.proprietary.policy.model;

import java.util.List;

/**
 * Resumable snapshot captured when a run pauses ({@link PolicyRunStatus#WAITING_FOR_INPUT}). {@code
 * resumeStepIndex} is the 0-based step to continue from; {@code pendingFileIds} are intermediate
 * files held in {@code FileStorage} (not in-memory resources) so a pause survives the worker thread
 * ending or a node restart.
 */
public record WaitState(String reason, int resumeStepIndex, List<String> pendingFileIds) {
    public WaitState {
        pendingFileIds = pendingFileIds == null ? List.of() : pendingFileIds;
    }
}
