package stirling.software.proprietary.policy.model;

import java.time.Instant;
import java.util.List;

import lombok.Getter;

import stirling.software.common.model.job.ResultFile;

/**
 * Live, mutable state of one pipeline run, held in memory by {@code PolicyRunRegistry} and the
 * authoritative source of the state machine. Carries execution state ({@code JobResult} does not
 * model status/step cursor/wait state); also projected into {@code TaskManager} for cluster-visible
 * status and download.
 */
@Getter
public class PolicyRun {

    private final String runId;

    /** ID of the stored policy that produced this run; null for ad-hoc pipelines. */
    private final String policyId;

    /**
     * ID of the source the input came from (folder, S3, webhook), or null when a user supplied the
     * files. Recorded on a failure so a reviewer can see where an unattended file came from.
     */
    private final String sourceId;

    private final PipelineDefinition definition;

    /**
     * The source's opaque reference to the document this run is about; null for an ad-hoc run or a
     * source that names no document. Hashed upstream, so never a path or a filename.
     */
    private final String fileIdentity;

    private final Instant createdAt = Instant.now();

    private volatile PolicyRunStatus status = PolicyRunStatus.PENDING;

    /** 1-based index of the step currently running (0 before the run starts). */
    private volatile int currentStep = 0;

    private volatile WaitState waitState;
    private volatile String error;

    /**
     * Stable, machine-readable failure code the client can branch on — e.g. an entitlement-limit
     * sentinel ({@code PAYG_LIMIT_REACHED} / {@code FEATURE_DEGRADED}) propagated from a downstream
     * tool call's 402 — alongside the human-readable {@link #error}. Null unless set on failure.
     */
    private volatile String errorCode;

    /**
     * For an entitlement-limit failure, whether the team was subscribed (over its spending cap) vs
     * un-subscribed (free allowance spent) — taken from the blocking 402 body. Drives which
     * usage-limit modal the client shows. Null unless {@link #errorCode} is an entitlement code.
     */
    private volatile Boolean errorSubscribed;

    private volatile List<ResultFile> outputs = List.of();
    private volatile Instant updatedAt = Instant.now();

    /**
     * Both references are required rather than defaulted: a run with neither is a real case (a
     * user's upload, an ad-hoc pipeline), but it should be stated at the call site. Overloads that
     * omitted them would make losing the attribution the frictionless option, which is how both
     * fields went unpopulated in the first place.
     */
    public PolicyRun(
            String runId,
            String policyId,
            PipelineDefinition definition,
            String sourceId,
            String fileIdentity) {
        this.runId = runId;
        this.policyId = policyId;
        this.sourceId = sourceId;
        this.definition = definition;
        this.fileIdentity = fileIdentity;
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

    /**
     * Fail with a stable {@code errorCode} the client can branch on (e.g. an entitlement-limit
     * sentinel from a downstream 402), plus the optional {@code subscribed} flag from that
     * response, in addition to the human-readable message.
     */
    public synchronized void failWithCode(String message, String errorCode, Boolean subscribed) {
        this.errorCode = errorCode;
        this.errorSubscribed = subscribed;
        fail(message);
    }

    public synchronized void waitForInput(WaitState wait) {
        this.waitState = wait;
        this.status = PolicyRunStatus.WAITING_FOR_INPUT;
        touch();
    }

    /** Cancels unless already terminal; returns whether it transitioned. */
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
