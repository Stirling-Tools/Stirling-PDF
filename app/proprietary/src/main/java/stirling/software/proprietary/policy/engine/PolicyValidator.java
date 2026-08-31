package stirling.software.proprietary.policy.engine;

import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.tool.ToolDiagnostic;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.service.ToolChainValidator;
import stirling.software.proprietary.policy.asset.PolicyAssetRefs;
import stirling.software.proprietary.policy.asset.PolicyAssetStore;
import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.RoutingRule;
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

    /** Upper bound on a policy's routing rules; see {@link #validateRoutingRules}. */
    private static final int MAX_ROUTING_RULES = 100;

    private final List<PolicyTrigger> triggers;
    private final List<InputSource> inputSources;
    private final List<PolicyOutputSink> outputSinks;
    private final List<PipelineStepValidator> stepValidators;
    private final SourceStore sourceStore;
    private final PolicyAssetStore assetStore;
    private final ToolChainValidator toolChainValidator;

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
        validateRoutingRules(policy);
        validateSteps(policy.steps());
        validateAssetReferences(policy);
        validateChain(policy.steps());
        validateOutput(policy.output());
    }

    /**
     * A routing rule must name a field, an operator, a destination that resolves to a writable
     * source, and - for the operators that compare - something to compare against. A rule failing
     * any of these would never fire, silently sending its documents to the fallback instead, so it
     * is rejected at save time rather than left to look like it works.
     */
    private void validateRoutingRules(Policy policy) {
        // A cap, like the one on inputs: rules are evaluated per document per run, so an
        // unreasonable number is a cost multiplier rather than a configuration anyone wants.
        if (policy.routingRules().size() > MAX_ROUTING_RULES) {
            throw new IllegalArgumentException(
                    "a policy supports at most " + MAX_ROUTING_RULES + " routing rules");
        }
        for (RoutingRule rule : policy.routingRules()) {
            if (rule.field() == null || rule.field().isBlank()) {
                throw new IllegalArgumentException("a routing rule must name a field to match on");
            }
            if (rule.operator() == null) {
                throw new IllegalArgumentException(
                        "routing rule on '" + rule.field() + "' has no operator");
            }
            // Blank values are rejected rather than ignored: a blank can never equal a real fact,
            // so it makes a matches-any rule dead and - worse - a matches-none rule claim
            // everything the fact is set on.
            if (rule.operator().usesValues()
                    && rule.values().stream().allMatch(value -> value == null || value.isBlank())) {
                throw new IllegalArgumentException(
                        "routing rule on '"
                                + rule.field()
                                + "' has nothing to match against; give it at least one value");
            }
            if (rule.outputId() == null || rule.outputId().isBlank()) {
                throw new IllegalArgumentException(
                        "routing rule on '" + rule.field() + "' has no destination");
            }
            Source destination =
                    sourceStore
                            .get(rule.outputId())
                            .orElseThrow(
                                    () ->
                                            new IllegalArgumentException(
                                                    "unknown routing destination: "
                                                            + rule.outputId()));
            validateOutput(destination.toOutputSpec());
        }
    }

    /**
     * A step binding that names stored assets ({@code asset:<id>}) must resolve in the policy's own
     * team, so a saved pipeline can't fail its later (principal-less) runs on a missing file, and a
     * client can't bind another team's asset by id. A binding without that prefix names a file
     * supplied with the run instead, and is only checked when the run arrives.
     */
    private void validateAssetReferences(Policy policy) {
        for (PipelineStep step : policy.steps()) {
            for (Map.Entry<String, String> binding : step.fileParameters().entrySet()) {
                if (!PolicyAssetRefs.isAssetRef(binding.getValue())) {
                    continue;
                }
                List<String> ids = PolicyAssetRefs.assetIds(binding.getValue());
                if (ids.isEmpty()) {
                    throw new IllegalArgumentException(
                            "step "
                                    + step.operation()
                                    + " has an empty file binding for field '"
                                    + binding.getKey()
                                    + "'");
                }
                for (String id : ids) {
                    // One message for absent and other-team: existence must not leak across teams.
                    assetStore
                            .get(id)
                            .filter(asset -> Objects.equals(asset.teamId(), policy.teamId()))
                            .orElseThrow(
                                    () ->
                                            new IllegalArgumentException(
                                                    "unknown stored file: " + id));
                }
            }
        }
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
