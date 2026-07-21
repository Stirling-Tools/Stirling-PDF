package stirling.software.proprietary.policy.output;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;

/**
 * Resolves a policy's effective output destination at run time: an {@code outputId} references a
 * {@link Source} used as the destination, looked up live (so editing the location updates every
 * policy that writes to it), exactly as input {@code sourceIds} are resolved. A policy without a
 * reference keeps its inline output (results returned to the caller) - the case for editor and
 * one-off policies. A reference that no longer resolves (location deleted out from under a live
 * policy - normally blocked by the source delete guard) falls back to inline delivery so the run
 * still completes.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PolicyOutputResolver {

    private final SourceStore sourceStore;

    public OutputSpec resolve(Policy policy) {
        String outputId = policy.outputId();
        if (outputId == null || outputId.isBlank()) {
            return policy.output();
        }
        return sourceStore
                .get(outputId)
                .map(Source::toOutputSpec)
                .orElseGet(
                        () -> {
                            log.warn(
                                    "Policy {} references missing output source {}; falling back to"
                                            + " inline delivery",
                                    policy.id(),
                                    outputId);
                            return policy.output();
                        });
    }
}
