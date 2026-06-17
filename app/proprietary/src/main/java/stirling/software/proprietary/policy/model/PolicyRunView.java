package stirling.software.proprietary.policy.model;

import java.util.List;

import stirling.software.common.model.job.ResultFile;

/**
 * Read-only view of a {@link PolicyRun} for the status endpoint. Outputs are {@link ResultFile}s,
 * downloadable via {@code GET /api/v1/general/files/{id}}.
 */
public record PolicyRunView(
        String runId,
        String policyId,
        PolicyRunStatus status,
        int currentStep,
        int stepCount,
        String error,
        String errorCode,
        Boolean errorSubscribed,
        List<ResultFile> outputs,
        /** When the run was created, epoch millis, so a rediscovered run shows its real age. */
        long createdAt) {

    public static PolicyRunView of(PolicyRun run) {
        return new PolicyRunView(
                run.getRunId(),
                run.getPolicyId(),
                run.getStatus(),
                run.getCurrentStep(),
                run.stepCount(),
                run.getError(),
                run.getErrorCode(),
                run.getErrorSubscribed(),
                run.getOutputs(),
                run.getCreatedAt().toEpochMilli());
    }
}
