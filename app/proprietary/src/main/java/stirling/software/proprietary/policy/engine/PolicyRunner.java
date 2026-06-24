package stirling.software.proprietary.policy.engine;

import java.io.IOException;
import java.util.List;
import java.util.function.Consumer;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.input.ResolvedInput;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.PolicyRunStatus;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;

/**
 * Turns a policy's referenced sources into runs: each {@code sourceId} is resolved live to its
 * persisted {@link Source}, then to an {@link InputSpec}. Triggers decide <em>when</em> and call
 * {@link #run(Policy)}; the controller uses the supplied-input and ad-hoc entry points.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class PolicyRunner {

    private final PolicyEngine policyEngine;
    private final List<InputSource> inputSources;
    private final SourceStore sourceStore;

    /**
     * Trigger entry point. Pulls every referenced source; each yielded unit becomes its own run so
     * one failure does not affect the others. No sources means one run with no input (generator
     * pipeline). Missing or disabled sources are skipped so one broken reference does not stop the
     * rest.
     */
    public void run(Policy policy) {
        List<String> sourceIds = policy.sourceIds();
        if (sourceIds.isEmpty()) {
            startRun(policy, PolicyInputs.of(List.of()), unused -> {});
            return;
        }
        for (String sourceId : sourceIds) {
            Source source = sourceStore.get(sourceId).orElse(null);
            if (source == null) {
                log.warn("Policy {} references missing source {}; skipping", policy.id(), sourceId);
                continue;
            }
            if (!source.enabled()) {
                log.debug(
                        "Source {} ({}) is disabled; skipping for policy {}",
                        sourceId,
                        source.name(),
                        policy.id());
                continue;
            }
            pullAndRun(policy, source.toInputSpec());
        }
    }

    /** Run a stored policy on caller-supplied files (e.g. manual upload), bypassing its sources. */
    public PolicyRunHandle runWith(
            Policy policy, PolicyInputs inputs, PolicyProgressListener listener) {
        return policyEngine.runPolicy(policy, inputs, listener);
    }

    /** Run an ad-hoc pipeline with no stored policy (AI/Automate one-offs). */
    public PolicyRunHandle runAdHoc(
            PipelineDefinition definition, PolicyInputs inputs, PolicyProgressListener listener) {
        return policyEngine.submit(definition, inputs, listener);
    }

    private void pullAndRun(Policy policy, InputSpec spec) {
        InputSource source = sourceFor(spec);
        if (source == null) {
            log.warn(
                    "No input source for type '{}' (policy {}); skipping",
                    spec.type(),
                    policy.id());
            return;
        }
        List<ResolvedInput> work;
        try {
            work = source.resolve(spec);
        } catch (IOException | RuntimeException e) {
            log.warn(
                    "Failed to resolve source '{}' for policy {}: {}",
                    spec.type(),
                    policy.id(),
                    e.getMessage());
            return;
        }
        for (ResolvedInput unit : work) {
            startRun(policy, unit.inputs(), unit.onComplete());
        }
    }

    private void startRun(Policy policy, PolicyInputs inputs, Consumer<Boolean> onComplete) {
        log.info("Running policy {} ({})", policy.id(), policy.name());
        PolicyRunHandle handle =
                policyEngine.runPolicy(policy, inputs, PolicyProgressListener.NOOP);
        handle.completion()
                .whenComplete((run, throwable) -> onComplete.accept(succeeded(run, throwable)));
    }

    private static boolean succeeded(PolicyRun run, Throwable throwable) {
        return throwable == null && run != null && run.getStatus() == PolicyRunStatus.COMPLETED;
    }

    private InputSource sourceFor(InputSpec spec) {
        return inputSources.stream()
                .filter(source -> source.supports(spec))
                .findFirst()
                .orElse(null);
    }
}
