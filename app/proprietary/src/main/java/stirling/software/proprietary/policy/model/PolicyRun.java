package stirling.software.proprietary.policy.model;

import java.time.Instant;
import java.util.List;

import lombok.Getter;

import stirling.software.common.model.job.ResultFile;

/**
 * Live, mutable state of a single pipeline run, held in memory by {@code PolicyRunRegistry}.
 *
 * <p>This carries the rich execution state (status, step cursor, wait state) that the job system's
 * {@code JobResult} does not model. The run is also projected into {@code TaskManager} for
 * cluster-visible status, progress notes, and file download; this object is the authoritative
 * source of the state machine.
 */
@Getter
public class PolicyRun {

    private final String runId;
    private final PipelineDefinition definition;
    private final Instant createdAt = Instant.now();

    private volatile PolicyRunStatus status = PolicyRunStatus.PENDING;

    /** 1-based index of the step currently running (0 before the run starts). */
    private volatile int currentStep = 0;

    private volatile WaitState waitState;
    private volatile String error;
    private volatile List<ResultFile> outputs = List.of();
    private volatile Instant updatedAt = Instant.now();

    public PolicyRun(String runId, PipelineDefinition definition) {
        this.runId = runId;
        this.definition = definition;
    }

    public int stepCount() {
        return definition.steps().size();
    }

    public synchronized void markRunning() {
        this.status = PolicyRunStatus.RUNNING;
        touch();
    }

    public synchronized void enterStep(int oneBasedStepIndex) {
        this.currentStep = oneBasedStepIndex;
        touch();
    }

    public synchronized void complete(List<ResultFile> resultFiles) {
        this.outputs = resultFiles == null ? List.of() : List.copyOf(resultFiles);
        this.status = PolicyRunStatus.COMPLETED;
        touch();
    }

    public synchronized void fail(String message) {
        this.error = message;
        this.status = PolicyRunStatus.FAILED;
        touch();
    }

    public synchronized void waitForInput(WaitState wait) {
        this.waitState = wait;
        this.status = PolicyRunStatus.WAITING_FOR_INPUT;
        touch();
    }

    /**
     * Mark cancelled if the run has not already reached a terminal state. Returns whether it did.
     */
    public synchronized boolean cancel() {
        if (status.isTerminal()) {
            return false;
        }
        this.status = PolicyRunStatus.CANCELLED;
        touch();
        return true;
    }

    private void touch() {
        this.updatedAt = Instant.now();
    }
}
