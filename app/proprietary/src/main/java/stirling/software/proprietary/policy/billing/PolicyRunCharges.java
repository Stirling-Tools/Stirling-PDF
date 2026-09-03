package stirling.software.proprietary.policy.billing;

import java.util.Optional;

/**
 * Settles the charge a policy run was submitted under, once that run's outcome is known. Only the
 * SaaS flavour has a bean; elsewhere runs are not charged and there is nothing to settle.
 *
 * <p>A run is accepted long before it succeeds or fails, so the request that opened the charge
 * cannot settle it. {@link #openedForCurrentRequest()} is read on the request thread; the token it
 * returns is handed back from the worker thread that reaches a terminal state.
 *
 * <p>A run whose outcome is never observed — the node dies mid-run — settles neither way, and the
 * charge is left for the stale-process sweep to close and bill as it always has.
 */
public interface PolicyRunCharges {

    /** The charge this request opened, or empty when the caller is not charged for runs. */
    Optional<String> openedForCurrentRequest();

    /** The run produced what was asked of it, so the charge stands. */
    void settleBilled(String chargeToken);

    /** The run failed, so the charge is released without billing. */
    void settleUnbilled(String chargeToken, String reason);
}
