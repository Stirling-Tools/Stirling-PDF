package stirling.software.proprietary.policy.output;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;

/**
 * Resolves a policy's effective output destination at run time: an {@code outputId} is looked up
 * live in the {@link OutputStore} (so editing the destination updates every policy that references
 * it), exactly as {@code sourceIds} are resolved to sources. A policy without a reference keeps its
 * inline output (results returned to the caller) - the case for editor and one-off policies. A
 * reference that no longer resolves (destination deleted out from under a live policy - normally
 * blocked by the delete guard) falls back to inline delivery so the run still completes.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PolicyOutputResolver {

    private final OutputStore outputStore;

    public OutputSpec resolve(Policy policy) {
        String outputId = policy.outputId();
        if (outputId == null || outputId.isBlank()) {
            return policy.output();
        }
        return outputStore
                .get(outputId)
                .map(Output::toOutputSpec)
                .orElseGet(
                        () -> {
                            log.warn(
                                    "Policy {} references missing output {}; falling back to inline"
                                            + " delivery",
                                    policy.id(),
                                    outputId);
                            return policy.output();
                        });
    }
}
