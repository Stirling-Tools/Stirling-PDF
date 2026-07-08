package stirling.software.proprietary.policy.output;

/**
 * Context for one run's output delivery. {@code policyId} is null for ad-hoc pipelines; when
 * present, sinks that land outputs somewhere an input source could re-discover them (e.g. a watched
 * folder) record each output in the processed-file ledger under that policy, so a policy never
 * re-ingests its own outputs while other policies watching the same place still can.
 */
public record OutputDelivery(String runId, String policyId) {}
