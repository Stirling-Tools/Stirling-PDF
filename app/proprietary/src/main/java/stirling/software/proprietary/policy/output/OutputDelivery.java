package stirling.software.proprietary.policy.output;

import java.util.List;

import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.model.PolicyRun;

/**
 * Context for one run's output delivery. {@code policyId} is null for ad-hoc pipelines; when
 * present, sinks record outputs in the processed-file ledger so the producing policy does not
 * re-ingest them. {@code inputs} carries the run's inputs so a sink that writes back to where the
 * input lives (e.g. a new version of a stored file) can correlate output to origin. {@code
 * fileOwner} is resolved from the input source or uploader by the engine; storage outputs require
 * it and must not substitute the destination's owner. {@code documentIdentity} is a stable
 * reference to the source document so a re-run upserts a vector document instead of duplicating it.
 */
public record OutputDelivery(
        String runId,
        String policyId,
        PolicyInputs inputs,
        String fileOwner,
        String documentIdentity) {

    public OutputDelivery {
        inputs = inputs == null ? PolicyInputs.of(List.of()) : inputs;
    }

    public OutputDelivery(String runId, String policyId, PolicyInputs inputs, String fileOwner) {
        this(runId, policyId, inputs, fileOwner, null);
    }

    public OutputDelivery(String runId, String policyId, PolicyInputs inputs) {
        this(runId, policyId, inputs, null, null);
    }

    public OutputDelivery(String runId, String policyId) {
        this(runId, policyId, null, null, null);
    }

    /** Reuses the run's document reference, scoped to its source or submitting user. */
    public static OutputDelivery forRun(PolicyRun run, PolicyInputs inputs) {
        String identity = null;
        if (inputs.primary().size() == 1) {
            if (run.getSourceId() != null) {
                String reference =
                        run.getFileIdentity() != null
                                ? run.getFileIdentity()
                                : inputs.primary().getFirst().getDescription();
                identity = "source:" + run.getSourceId() + "\n" + reference;
            } else if (run.getFileIdentity() != null) {
                identity = "user:" + run.getTriggeringUser() + "\n" + run.getFileIdentity();
            }
        }
        return new OutputDelivery(run.getRunId(), run.getPolicyId(), inputs, null, identity);
    }
}
