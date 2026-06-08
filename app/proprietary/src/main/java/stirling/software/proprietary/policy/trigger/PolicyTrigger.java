package stirling.software.proprietary.policy.trigger;

import stirling.software.proprietary.policy.model.TriggerConfig;

/**
 * An automatic trigger: the thing that decides <em>when</em> a policy runs without a person asking.
 * A trigger owns a {@link #type()} (matching {@code TriggerConfig.type()}); when its condition
 * fires it hands the policy to the {@code PolicyRunner}, which pulls the policy's sources and
 * starts the runs. A trigger never resolves sources itself.
 *
 * <p>Triggers are background, configuration-driven beans (schedule, and in future webhook or
 * folder-watch): on {@link #start()} they begin watching/scheduling for the policies returned by
 * {@code PolicyStore.findByTriggerType(type())}, and stop on {@link #stop()}. New trigger kinds are
 * new beans of this type; the runner and the {@code Policy} model do not change.
 *
 * <p>Manual running is not a trigger - every policy can always be run on demand via the {@code
 * PolicyRunner} regardless of whether it has a trigger.
 */
public interface PolicyTrigger {

    /** Stable identifier for this trigger kind, matching {@code TriggerConfig.type()}. */
    String type();

    /**
     * Check that a policy's trigger config is usable, throwing {@link IllegalArgumentException} if
     * not. Called when a policy is saved so misconfiguration fails fast rather than at fire time.
     */
    default void validate(TriggerConfig config) {}

    /** Begin activating policies of this type (e.g. start the schedule sweep). */
    default void start() {}

    /** Stop activating and release any resources. */
    default void stop() {}
}
