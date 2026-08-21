package stirling.software.proprietary.policy.model;

import java.util.List;
import java.util.Map;

import stirling.software.common.cluster.JobStoreEntry;
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

    /** Cross-node view from a shared job-store entry; step cursor is node-local so it reads 0. */
    public static PolicyRunView ofEntry(JobStoreEntry entry) {
        Map<String, String> meta = entry.resultMeta() == null ? Map.of() : entry.resultMeta();
        PolicyRunStatus status =
                switch (entry.state()) {
                    case COMPLETE -> PolicyRunStatus.COMPLETED;
                    case FAILED -> PolicyRunStatus.FAILED;
                    case RUNNING, PENDING -> PolicyRunStatus.RUNNING;
                };
        List<ResultFile> outputs =
                entry.fileIds() == null
                        ? List.of()
                        : entry.fileIds().stream()
                                .map(id -> ResultFile.builder().fileId(id).build())
                                .toList();
        long createdAt = entry.createdAt() == null ? 0L : entry.createdAt().toEpochMilli();
        return new PolicyRunView(
                entry.jobId(),
                meta.get("policyId"),
                status,
                0,
                0,
                entry.error(),
                null,
                null,
                outputs,
                createdAt);
    }
}
