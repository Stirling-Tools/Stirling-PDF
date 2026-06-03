package stirling.software.proprietary.policy.trigger;

/**
 * Activates policies of one trigger type. A trigger owns a {@link #type()} (matching {@code
 * TriggerConfig.type()}); when its condition fires it runs the relevant {@code Policy} through the
 * {@code PolicyEngine}.
 *
 * <p>Background triggers (folder watcher, schedule) are driven by configuration: on {@link
 * #start()} they begin watching/scheduling for the policies returned by {@code
 * PolicyStore.findByTriggerType(type())}, and stop on {@link #stop()}. Request-driven triggers
 * (manual) have no background lifecycle and run a policy directly in response to a call. New
 * trigger kinds are new beans of this type; the engine and the {@code Policy} model do not change.
 */
public interface PolicyTrigger {

    /** Stable identifier for this trigger kind, matching {@code TriggerConfig.type()}. */
    String type();

    /** Begin activating policies of this type (e.g. start a folder watcher). No-op for manual. */
    default void start() {}

    /** Stop activating and release any resources. */
    default void stop() {}
}
