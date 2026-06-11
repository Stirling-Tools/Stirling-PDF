package stirling.software.proprietary.policy.model;

import java.util.List;

import stirling.software.common.model.job.ResultFile;

/**
 * Read-only view of a {@link PolicyRun} for the status endpoint. Outputs are {@link ResultFile}s,
 * downloadable via {@code GET /api/v1/general/files/{id}}.
 */
public record PolicyRunView(
        String runId,
        PolicyRunStatus status,
        int currentStep,
        int stepCount,
        String error,
        List<ResultFile> outputs) {

    public static PolicyRunView of(PolicyRun run) {
        return new PolicyRunView(
                run.getRunId(),
                run.getStatus(),
                run.getCurrentStep(),
                run.stepCount(),
                run.getError(),
                run.getOutputs());
    }
}
