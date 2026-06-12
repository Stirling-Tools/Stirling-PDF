package stirling.software.proprietary.policy.engine;

import java.io.IOException;
import java.util.List;
import java.util.function.Consumer;

import jakarta.enterprise.context.ApplicationScoped;

import io.quarkus.arc.All;

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

/**
 * Runs policies, and is the one place that knows how to turn a policy's configured {@link InputSpec
 * sources} into actual runs. Triggers (schedule, and future webhook/folder-watch) decide
 * <em>when</em> to run and call {@link #run(Policy)}; they never touch sources themselves. The
 * controller uses the supplied-input and ad-hoc entry points for on-demand work.
 *
 * <p>This is the seam that keeps triggers and sources independent: a trigger depends on the runner,
 * the runner depends on the {@link InputSource} beans, and a source depends on neither - it just
 * yields {@link ResolvedInput units of work}, each carrying its own completion hook.
 */
@Slf4j
@ApplicationScoped
public class PolicyRunner {

    private final PolicyEngine policyEngine;
    private final List<InputSource> inputSources;

    @jakarta.inject.Inject
    public PolicyRunner(PolicyEngine policyEngine, @All List<InputSource> inputSources) {
        this.policyEngine = policyEngine;
        this.inputSources = inputSources;
    }

    /**
     * Run a policy by pulling from every source it configures: each source yields zero or more
     * units of work, and each unit becomes its own run so one failure does not affect the others. A
     * policy with no sources runs once with no input files (a generator pipeline). Used by
     * automatic triggers.
     */
    public void run(Policy policy) {
        List<InputSpec> sources = policy.sources();
        if (sources.isEmpty()) {
            startRun(policy, PolicyInputs.of(List.of()), unused -> {});
            return;
        }
        for (InputSpec spec : sources) {
            pullAndRun(policy, spec);
        }
    }

    /**
     * Run a stored policy on files supplied directly by the caller (e.g. a manual run with
     * uploads), bypassing its configured sources. Returns the run handle so callers can stream
     * progress.
     */
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
