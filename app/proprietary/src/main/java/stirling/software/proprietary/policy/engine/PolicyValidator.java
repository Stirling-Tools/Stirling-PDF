package stirling.software.proprietary.policy.engine;

import java.util.List;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.output.PolicyOutputSink;
import stirling.software.proprietary.policy.trigger.PolicyTrigger;

/**
 * Validates a policy at save time by delegating each facet (trigger, sources, output) to the bean
 * that handles its type, so a misconfiguration fails fast rather than at run time. A null trigger
 * is a manual-only policy and skips trigger validation.
 */
@Service
@RequiredArgsConstructor
public class PolicyValidator {

    private final List<PolicyTrigger> triggers;
    private final List<InputSource> inputSources;
    private final List<PolicyOutputSink> outputSinks;

    /**
     * @throws IllegalArgumentException if any facet's type is unknown or its config is invalid
     */
    public void validate(Policy policy) {
        if (policy.trigger() != null) {
            triggerFor(policy.trigger()).validate(policy);
        }
        for (InputSpec source : policy.sources()) {
            inputSourceFor(source).validate(source);
        }
        outputSinkFor(policy.output()).validate(policy.output());
    }

    private PolicyTrigger triggerFor(TriggerConfig config) {
        return triggers.stream()
                .filter(trigger -> trigger.type().equals(config.type()))
                .findFirst()
                .orElseThrow(
                        () ->
                                new IllegalArgumentException(
                                        "unknown trigger type: " + config.type()));
    }

    private InputSource inputSourceFor(InputSpec spec) {
        return inputSources.stream()
                .filter(source -> source.supports(spec))
                .findFirst()
                .orElseThrow(
                        () ->
                                new IllegalArgumentException(
                                        "unknown input source type: " + spec.type()));
    }

    private PolicyOutputSink outputSinkFor(OutputSpec spec) {
        return outputSinks.stream()
                .filter(sink -> sink.supports(spec))
                .findFirst()
                .orElseThrow(
                        () -> new IllegalArgumentException("unknown output type: " + spec.type()));
    }
}
