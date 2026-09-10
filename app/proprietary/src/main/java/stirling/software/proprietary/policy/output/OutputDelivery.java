package stirling.software.proprietary.policy.output;

import java.util.List;

import stirling.software.proprietary.policy.model.PolicyInputs;

/**
 * Context for one run's output delivery. {@code policyId} is null for ad-hoc pipelines; when
 * present, sinks record outputs in the processed-file ledger so the producing policy does not
 * re-ingest them. {@code inputs} carries the run's inputs so a sink that writes back to where the
 * input lives (e.g. a new version of a stored file) can correlate output to origin.
 */
public record OutputDelivery(String runId, String policyId, PolicyInputs inputs) {

    public OutputDelivery {
        inputs = inputs == null ? PolicyInputs.of(List.of()) : inputs;
    }

    public OutputDelivery(String runId, String policyId) {
        this(runId, policyId, null);
    }
}
