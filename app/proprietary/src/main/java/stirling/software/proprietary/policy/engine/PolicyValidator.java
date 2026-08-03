package stirling.software.proprietary.policy.engine;

import java.util.List;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;

import stirling.software.common.model.tool.ToolDiagnostic;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.service.ToolChainValidator;
import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.PipelineStep;
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
@ApplicationScoped
@IfBuildProfile("saas")
public class PolicyValidator {

    // Spring injected a List<T> of all beans of each type; CDI collects all beans of a type
    // via Instance<T>, which is iterable. Field injection is used (instead of constructor
    // injection via Lombok @RequiredArgsConstructor) because Instance<T> is the CDI-native
    // collection type and the fields cannot be final.
    @Inject Instance<PolicyTrigger> triggers;
    @Inject Instance<InputSource> inputSources;
    @Inject Instance<PolicyOutputSink> outputSinks;
    @Inject Instance<PipelineStepValidator> stepValidators;
    @Inject SourceStore sourceStore;
    @Inject ToolChainValidator toolChainValidator;

    /**
     * @throws IllegalArgumentException if the policy has more than one input or output, any facet's
     *     type is unknown, a referenced source does not exist, a trigger is incompatible with its
     *     input's source, or any config is invalid
     */
    public void validate(Policy policy) {
        // Deliberate product cap, not a model limit: the lists stay lists so multiple
        // inputs/outputs can be supported later, but today a policy carries at most one of
        // each (zero of either remains fine - run on demand / inline output).
        if (policy.inputs().size() > 1) {
            throw new IllegalArgumentException("a policy supports at most one input");
        }
        if (policy.outputIds().size() > 1) {
            throw new IllegalArgumentException("a policy supports at most one output");
        }
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
        validateSteps(policy.steps());
        validateChain(policy.steps());
        validateOutput(policy.output());
    }

    /**
     * Reject a chain whose steps cannot run on each other. Such a policy saves fine today and only
     * fails part-way through its first run, which for a scheduled one may be much later.
     *
     * <p>Only errors block; warnings depend on configuration or file content.
     *
     * @throws IllegalArgumentException if any step cannot accept what the one before it produces
     */
    public void validateChain(List<PipelineStep> steps) {
        List<ToolDiagnostic> diagnostics = diagnoseChain(steps, null);
        if (!ToolChainValidator.hasErrors(diagnostics)) {
            return;
        }
        String reasons =
                diagnostics.stream()
                        .filter(d -> d.severity() == ToolDiagnostic.Severity.ERROR)
                        .map(d -> "step " + (d.stepIndex() + 1) + ": " + d.message())
                        .reduce((a, b) -> a + "; " + b)
                        .orElse("");
        throw new IllegalArgumentException("pipeline steps cannot run in this order - " + reasons);
    }

    /**
     * Everything wrong with a chain, without rejecting it, so a caller can show warnings and
     * fan-out notes too.
     *
     * @param sourceFormat the format entering the first step, or null when unknown
     */
    public List<ToolDiagnostic> diagnoseChain(List<PipelineStep> steps, ToolFormat sourceFormat) {
        List<ToolChainValidator.Step> chain =
                steps.stream()
                        .map(
                                step ->
                                        new ToolChainValidator.Step(
                                                step.operation(), step.parameters()))
                        .toList();
        return toolChainValidator.validate(chain, sourceFormat);
    }

    /**
     * Validate each step against every registered {@link PipelineStepValidator}. Must be called on
     * a request thread (caller's principal present) for the same reason as {@link
     * #validateOutput(OutputSpec)}: a step that dereferences an integration connection by id is
     * access-checked here or nowhere, since the worker thread that later runs it has no principal.
     *
     * @throws IllegalArgumentException if any step is invalid or references an inaccessible
     *     resource
     */
    public void validateSteps(List<PipelineStep> steps) {
        for (PipelineStep step : steps) {
            for (PipelineStepValidator validator : stepValidators) {
                validator.validate(step);
            }
        }
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
