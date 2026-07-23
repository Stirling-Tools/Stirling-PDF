package stirling.software.proprietary.policy.engine;

import stirling.software.proprietary.policy.model.PipelineStep;

/**
 * Save-time validation for one tool's step parameters. Implementations cover the tools whose
 * endpoints reject or no-op on missing configuration, so a policy that would fail on every run (or
 * silently do nothing) is refused at save instead. Steps whose operation no validator supports pass
 * unchecked.
 */
public interface PolicyStepValidator {

    /** Whether this validator covers the step's operation (endpoint path). */
    boolean supports(String operation);

    /**
     * @throws IllegalArgumentException with a user-presentable message when the step's parameters
     *     cannot produce a successful run
     */
    void validate(PipelineStep step);
}
