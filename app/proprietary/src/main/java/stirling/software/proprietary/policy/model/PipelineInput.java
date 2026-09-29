package stirling.software.proprietary.policy.model;

/**
 * One input of a policy: a reference to a persisted {@code Source} paired with the {@link
 * TriggerConfig} that decides when <em>this</em> source is pulled. The trigger lives on the
 * binding, not on the source (so one connection can feed many policies on different schedules) and
 * not on the policy (so a folder input can be watched while an S3 input on the same policy polls).
 * A {@code null} trigger means this input is pulled only when the policy is run on demand.
 */
public record PipelineInput(String sourceId, TriggerConfig trigger) {

    /** An input with no automatic trigger: pulled only on a manual run. */
    public static PipelineInput manual(String sourceId) {
        return new PipelineInput(sourceId, null);
    }
}
