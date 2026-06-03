package stirling.software.proprietary.policy.trigger;

/**
 * A source of pipeline runs. Triggers are Spring beans that, on some condition, build a {@code
 * PipelineDefinition} with inputs and hand it to the {@code PolicyEngine}.
 *
 * <p>Background triggers (folder watcher, schedule) own their own lifecycle via {@link #start()} /
 * {@link #stop()}. Request-driven triggers (manual) leave those as no-ops and fire directly in
 * response to a call. New trigger kinds are added as new beans without changing the engine.
 */
public interface PolicyTrigger {

    /** Stable identifier for this trigger kind (e.g. "manual", "folder", "schedule"). */
    String type();

    /** Begin listening for the trigger condition. No-op for request-driven triggers. */
    default void start() {}

    /** Stop listening and release any resources. */
    default void stop() {}
}
