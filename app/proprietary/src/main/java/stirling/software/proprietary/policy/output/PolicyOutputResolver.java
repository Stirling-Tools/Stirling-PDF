package stirling.software.proprietary.policy.output;

import java.util.List;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;

/**
 * Resolves saved destinations at dispatch; unavailable references fail instead of returning files
 * inline.
 */
@Service
@RequiredArgsConstructor
public class PolicyOutputResolver {

    private final SourceStore sourceStore;

    public List<OutputSpec> resolve(Policy policy) {
        List<String> outputIds = policy.outputIds();
        if (outputIds.isEmpty()) {
            return List.of(policy.output());
        }
        return outputIds.stream()
                .map(
                        id ->
                                sourceStore
                                        .get(id)
                                        .filter(Source::enabled)
                                        .filter(source -> !"editor".equals(source.type()))
                                        .orElseThrow(
                                                () ->
                                                        new IllegalArgumentException(
                                                                "The output destination is missing, disabled, or unavailable"))
                                        .toOutputSpec())
                .toList();
    }
}
