package stirling.software.proprietary.policy.engine;

import stirling.software.proprietary.policy.model.PipelineStep;

/**
 * Validates one step's parameters before a run is admitted. Implementations are beans discovered by
 * {@link PolicyValidator}, so the feature that understands a step's parameters owns their rules
 * without the engine depending on it.
 *
 * <p>Steps run on a worker thread with no {@code SecurityContext}, so anything a step dereferences
 * by id - an integration connection, say - cannot be authorization-checked at run time. A validator
 * that resolves such a reference must therefore be called while the caller's principal is still
 * present, which is what {@link PolicyValidator#validateSteps} guarantees.
 */
public interface PipelineStepValidator {

    /**
     * @throws IllegalArgumentException if the step is misconfigured or references something the
     *     current caller may not use
     */
    void validate(PipelineStep step);
}
