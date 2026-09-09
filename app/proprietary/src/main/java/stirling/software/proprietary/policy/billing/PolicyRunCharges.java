package stirling.software.proprietary.policy.billing;

/**
 * Settles the charges a policy run's tool steps opened, once the run's outcome is known. Only the
 * SaaS flavour has a bean; elsewhere runs are not charged and there is nothing to settle.
 *
 * <p>Every step of a run is a tool call that opens or joins a charge keyed by the run id, and none
 * of them bill on their own: a run is accepted long before it succeeds or fails, and a meter event
 * cannot be unsent. The engine reports the terminal state, and everything under that run id is
 * billed or released accordingly.
 *
 * <p>A run whose outcome is never observed (the node dies mid-run) settles neither way, and its
 * charges are left for the stale-process sweep to close and bill as it always has.
 */
public interface PolicyRunCharges {

    /** The run produced what was asked of it, so its charges stand. */
    void settleBilled(String runId);

    /** The run failed, so its charges are released without billing. */
    void settleUnbilled(String runId, String reason);
}
