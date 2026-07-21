package stirling.software.proprietary.policy.engine;

import java.util.List;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.output.PolicyOutputSink;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.trigger.PolicyTrigger;

/**
 * Validates a policy at save time by delegating each facet (inputs, their triggers, output) to the
 * bean that handles its type, so a misconfiguration fails fast rather than at run time. Each
 * input's {@code sourceId} must resolve to a persisted {@link Source} whose config its {@link
 * InputSource} bean accepts; its optional trigger must be a known type compatible with that source.
 * A null trigger is a manual-only input and skips trigger validation.
 */
@Service
@RequiredArgsConstructor
public class PolicyValidator {

    private final List<PolicyTrigger> triggers;
    private final List<InputSource> inputSources;
    private final List<PolicyOutputSink> outputSinks;
    private final SourceStore sourceStore;

    /**
     * @throws IllegalArgumentException if any facet's type is unknown, a referenced source does not
     *     exist, a trigger is incompatible with its input's source, or any config is invalid
     */
    public void validate(Policy policy) {
        for (PipelineInput input : policy.inputs()) {
            Source source =
                    sourceStore
                            .get(input.sourceId())
                            .orElseThrow(
                                    () ->
                                            new IllegalArgumentException(
                                                    "unknown source: " + input.sourceId()));
            if (input.trigger() != null) {
                validateTrigger(policy, input, source);
            }
            InputSpec spec = source.toInputSpec();
            inputSourceFor(spec).validate(spec);
        }
        validateOutput(policy.output());
    }

    /**
     * Check an input's trigger is a known type whose source constraints its source satisfies (e.g.
     * folder-watch only on a folder source), then let the trigger validate its own options.
     */
    private void validateTrigger(Policy policy, PipelineInput input, Source source) {
        PolicyTrigger trigger = triggerFor(input.trigger());
        if (!trigger.supportedSourceTypes().isEmpty()
                && !trigger.supportedSourceTypes().contains(source.type())) {
            throw new IllegalArgumentException(
                    "trigger '"
                            + trigger.type()
                            + "' is not compatible with source type '"
                            + source.type()
                            + "'");
        }
        trigger.validate(policy, input);
    }

    /**
     * Validate an output spec against its sink. Must be called on a request thread (caller's
     * principal present) so an S3 output's connection is authorization-checked against the caller -
     * ad-hoc runs are never persisted and so never hit {@link #validate(Policy)}, and the worker
     * thread that later delivers has no principal, so this is their only access gate.
     *
     * @throws IllegalArgumentException if the type is unknown or the config is invalid/inaccessible
     */
    public void validateOutput(OutputSpec output) {
        outputSinkFor(output).validate(output);
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
