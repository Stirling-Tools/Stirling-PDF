package stirling.software.proprietary.policy.output;

import java.util.List;

import stirling.software.proprietary.policy.model.PolicyInputs;

/**
 * Context for one run's output delivery. {@code policyId} is null for ad-hoc pipelines; when
 * present, sinks record outputs in the processed-file ledger so the producing policy does not
 * re-ingest them. {@code inputs} carries the run's inputs so a sink that writes back to where the
 * input lives (e.g. a new version of a stored file) can correlate output to origin. {@code
 * fileOwner} is resolved from the input source or uploader by the engine; storage outputs require
 * it and must not substitute the destination's owner.
 */
public record OutputDelivery(String runId, String policyId, PolicyInputs inputs, String fileOwner) {

    public OutputDelivery {
        inputs = inputs == null ? PolicyInputs.of(List.of()) : inputs;
    }

    public OutputDelivery(String runId, String policyId, PolicyInputs inputs) {
        this(runId, policyId, inputs, null);
    }

    public OutputDelivery(String runId, String policyId) {
        this(runId, policyId, null, null);
    }
}
