package stirling.software.proprietary.policy.engine;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;

import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.output.PolicyOutputSink;
import stirling.software.proprietary.policy.trigger.PolicyTrigger;

/**
 * Validates a policy's trigger, sources, and output configuration by delegating each facet to the
 * bean that handles its type. Called when a policy is saved so a misconfigured schedule, missing
 * folder directory, or unknown type fails fast instead of silently misbehaving at run time.
 *
 * <p>The trigger is optional (a {@code null} trigger is a manual-only policy and needs no
 * validation); every configured source is validated.
 */
@ApplicationScoped
public class PolicyValidator {

    // Spring injected a List<T> of all beans of each type; CDI collects all beans of a type
    // via Instance<T>, which is iterable. Field injection is used (instead of constructor
    // injection via Lombok @RequiredArgsConstructor) because Instance<T> is the CDI-native
    // collection type and the fields cannot be final.
    @Inject Instance<PolicyTrigger> triggers;
    @Inject Instance<InputSource> inputSources;
    @Inject Instance<PolicyOutputSink> outputSinks;

    /**
     * @throws IllegalArgumentException if any facet's type is unknown or its configuration is
     *     invalid
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
