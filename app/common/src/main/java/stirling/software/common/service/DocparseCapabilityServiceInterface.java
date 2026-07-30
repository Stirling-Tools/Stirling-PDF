package stirling.software.common.service;

/**
 * View of the engine's DocParse capability for modules that cannot see the proprietary
 * implementation (e.g. ConfigController in core). Implemented by the proprietary
 * DocparseCapabilityService; absent when the proprietary module is not loaded.
 */
public interface DocparseCapabilityServiceInterface {

    /**
     * Whether the engine reports the docparse addon (advanced tier) as installed. Must be cheap and
     * non-blocking: returns the cached probe result, {@code false} when the engine is disabled,
     * unreachable, or not yet probed.
     */
    boolean isAdvancedInstalled();
}
