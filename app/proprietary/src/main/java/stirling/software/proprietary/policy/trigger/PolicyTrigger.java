package stirling.software.proprietary.policy.trigger;

import stirling.software.proprietary.policy.model.Policy;

/**
 * Decides <em>when</em> a policy runs. On firing it hands the policy to {@code PolicyRunner}; it
 * never resolves sources itself. New trigger kinds are just new beans of this type.
 */
public interface PolicyTrigger {

    /** Matches {@code TriggerConfig.type()}. */
    String type();

    /**
     * Validate at save time so misconfiguration fails fast, not at fire time. Receives the whole
     * {@link Policy} so triggers that depend on the policy's sources (folder-watch) can check that.
     */
    default void validate(Policy policy) {}

    default void start() {}

    default void stop() {}
}
