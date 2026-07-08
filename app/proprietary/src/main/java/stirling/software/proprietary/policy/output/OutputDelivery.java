package stirling.software.proprietary.policy.output;

/**
 * Context for one run's output delivery. {@code policyId} is null for ad-hoc pipelines; when
 * present, sinks record outputs in the processed-file ledger so the producing policy does not
 * re-ingest them.
 */
public record OutputDelivery(String runId, String policyId) {}
