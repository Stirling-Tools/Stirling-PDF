package stirling.software.proprietary.policy.output;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;

/**
 * Resolves a policy's effective output destinations at run time: each {@code outputId} references a
 * {@link Source} used as a destination, looked up live (so editing a location updates every policy
 * that writes to it), exactly as input {@code sourceIds} are resolved. A run is delivered to every
 * resolved destination. A policy with no references keeps its inline output (results returned to
 * the caller) - the case for editor and one-off policies. A reference that no longer resolves
 * (location deleted out from under a live policy - normally blocked by the source delete guard) is
 * skipped; if none resolve, delivery falls back to inline so the run still completes.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PolicyOutputResolver {

    private final SourceStore sourceStore;

    public List<OutputSpec> resolve(Policy policy) {
        List<String> outputIds = policy.outputIds();
        if (outputIds.isEmpty()) {
            return List.of(policy.output());
        }
        List<OutputSpec> resolved = new ArrayList<>();
        for (String outputId : outputIds) {
            sourceStore
                    .get(outputId)
                    .map(Source::toOutputSpec)
                    .ifPresentOrElse(
                            resolved::add,
                            () ->
                                    log.warn(
                                            "Policy {} references missing output source {}; skipping"
                                                    + " that destination",
                                            policy.id(),
                                            outputId));
        }
        return resolved.isEmpty() ? List.of(policy.output()) : resolved;
    }
}
