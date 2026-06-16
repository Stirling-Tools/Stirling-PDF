package stirling.software.proprietary.policy.model;

import java.util.List;

/**
 * Captured when a run pauses in {@link PolicyRunStatus#WAITING_FOR_INPUT}. Together with the run's
 * {@link PipelineDefinition} this is the resumable snapshot: {@code resumeStepIndex} is the 0-based
 * step to continue from, and {@code pendingFileIds} are the intermediate files (stored in {@code
 * FileStorage}, so they survive the worker thread ending or a node restart) that become the input
 * to the resumed run.
 *
 * <p>Stored as fileIds rather than in-memory resources by design: a paused run must be resumable
 * long after its worker thread has gone.
 */
public record WaitState(String reason, int resumeStepIndex, List<String> pendingFileIds) {
    public WaitState {
        pendingFileIds = pendingFileIds == null ? List.of() : pendingFileIds;
    }
}
