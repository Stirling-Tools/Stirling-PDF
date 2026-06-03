package stirling.software.proprietary.policy.engine;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;

import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.ResultFile;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.InternalApiTimeoutException;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.service.TaskManager;
import stirling.software.common.util.ExecutorFactory;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.WaitState;
import stirling.software.proprietary.policy.output.PolicyOutputSink;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;

/**
 * Runs pipelines asynchronously as tracked jobs.
 *
 * <p>Each run is the unit of async work: {@link #submit} returns a run id immediately and the
 * pipeline executes on a virtual thread, so a step blocking on a slow tool does not tie up a
 * platform thread. The run drives {@link PolicyExecutor} for the actual step loop, registers its
 * outputs and progress with {@link TaskManager} (so the existing job status/download endpoints work
 * unchanged), and keeps rich state in {@link PolicyRunRegistry}.
 *
 * <p>The engine deliberately manages its own virtual-thread execution rather than routing through
 * {@code JobExecutorService}: that path force-completes a job once its work returns, which is
 * incompatible with a run that suspends in {@code WAITING_FOR_INPUT}. Resource-aware queueing can
 * be layered on during hardening.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PolicyEngine {

    private final PolicyExecutor stepExecutor;
    private final TaskManager taskManager;
    private final PolicyRunRegistry registry;
    private final FileStorage fileStorage;
    private final JobOwnershipService jobOwnershipService;
    private final List<PolicyOutputSink> outputSinks;

    private final ExecutorService asyncExecutor = ExecutorFactory.newVirtualThreadExecutor();

    /**
     * Submit a pipeline to run asynchronously. The returned handle's run id scopes a job in {@link
     * TaskManager}, so progress (notes), status, and result files are observable via the existing
     * job endpoints as well as via {@link #getRun(String)}; its completion future resolves when the
     * run reaches a terminal or paused state.
     */
    public PolicyRunHandle submit(
            PipelineDefinition definition, List<Resource> inputs, PolicyProgressListener listener) {
        // Scope the run id to the current user (on this request thread) so the file-download
        // ownership check passes; NoOpJobOwnershipService returns the id unchanged when security
        // is off.
        String runId = jobOwnershipService.createScopedJobKey(UUID.randomUUID().toString());
        taskManager.createTask(runId);
        PolicyRun run = new PolicyRun(runId, definition);
        registry.register(run);
        CompletableFuture<PolicyRun> completion = new CompletableFuture<>();
        PolicyProgressListener tracking = trackingListener(runId, run, listener);
        asyncExecutor.execute(() -> runToCompletion(run, inputs, tracking, completion));
        return new PolicyRunHandle(runId, completion);
    }

    public PolicyRun getRun(String runId) {
        return registry.get(runId);
    }

    /**
     * Request cancellation of a run. Stage 1 marks the run cancelled in the registry if it has not
     * already finished; interrupting an in-flight tool call lands in a later stage.
     */
    public boolean cancel(String runId) {
        PolicyRun run = registry.get(runId);
        if (run == null) {
            return false;
        }
        boolean cancelled = run.cancel();
        if (cancelled) {
            taskManager.addNote(runId, "Run cancelled by request");
        }
        return cancelled;
    }

    /**
     * Resume a run paused in {@code WAITING_FOR_INPUT}. Not yet implemented; the run shape and
     * {@link WaitState} snapshot are in place so this can be added without reworking the engine.
     */
    public String resume(String runId, List<Resource> additionalInputs) {
        throw new UnsupportedOperationException("Pause/resume is not yet implemented");
    }

    private void runToCompletion(
            PolicyRun run,
            List<Resource> inputs,
            PolicyProgressListener listener,
            CompletableFuture<PolicyRun> completion) {
        String runId = run.getRunId();
        try {
            run.markRunning();
            PolicyExecutionResult result =
                    stepExecutor.execute(run.getDefinition(), inputs, listener);
            OutputSpec output = run.getDefinition().output();
            List<ResultFile> outputs = sinkFor(output).deliver(runId, result.files(), output);
            taskManager.setMultipleFileResults(runId, outputs);
            taskManager.setComplete(runId);
            run.complete(outputs);
        } catch (PolicyInputRequiredException e) {
            // Designed-for path: suspend the run rather than fail it. Persist intermediates as
            // fileIds so the run can resume after this worker thread is gone.
            WaitState wait = suspend(e);
            run.waitForInput(wait);
            taskManager.addNote(runId, "Waiting for input: " + e.getMessage());
        } catch (InternalApiTimeoutException e) {
            String message = toolTimeoutMessage(e);
            log.error(
                    "Policy run {} timed out on {}: {}",
                    runId,
                    e.getEndpointPath(),
                    e.getMessage());
            run.fail(message);
            taskManager.setError(runId, message);
        } catch (Exception e) {
            String message = "Policy run failed: " + e.getMessage();
            log.error("Policy run {} failed", runId, e);
            run.fail(message);
            taskManager.setError(runId, message);
        } finally {
            // Always resolve the handle with the run's final state so stream/await callers unblock.
            completion.complete(run);
        }
    }

    private WaitState suspend(PolicyInputRequiredException e) {
        List<String> fileIds = new ArrayList<>();
        for (Resource resource : e.getPendingFiles()) {
            String name = resource.getFilename() != null ? resource.getFilename() : "pending";
            try (InputStream is = resource.getInputStream()) {
                fileIds.add(fileStorage.storeInputStream(is, name).fileId());
            } catch (IOException io) {
                log.warn("Failed to persist pending file for paused run: {}", io.getMessage());
            }
        }
        return new WaitState(e.getMessage(), e.getResumeStepIndex(), fileIds);
    }

    private PolicyProgressListener trackingListener(
            String runId, PolicyRun run, PolicyProgressListener delegate) {
        return new PolicyProgressListener() {
            @Override
            public void onStepStart(int stepIndex, int stepCount, String operation) {
                run.enterStep(stepIndex);
                taskManager.addNote(
                        runId,
                        "Step " + stepIndex + "/" + stepCount + ": " + operation + " started");
                delegate.onStepStart(stepIndex, stepCount, operation);
            }

            @Override
            public void onStepComplete(int stepIndex, int stepCount, String operation) {
                taskManager.addNote(
                        runId,
                        "Step " + stepIndex + "/" + stepCount + ": " + operation + " completed");
                delegate.onStepComplete(stepIndex, stepCount, operation);
            }

            @Override
            public void onHeartbeat() {
                delegate.onHeartbeat();
            }
        };
    }

    private PolicyOutputSink sinkFor(OutputSpec spec) {
        return outputSinks.stream()
                .filter(sink -> sink.supports(spec))
                .findFirst()
                .orElseThrow(
                        () ->
                                new IllegalStateException(
                                        "No output sink supports spec: "
                                                + (spec == null ? "<null>" : spec.type())));
    }

    private static String toolTimeoutMessage(InternalApiTimeoutException e) {
        return String.format(
                "The %s tool did not respond within %d seconds and was aborted.",
                e.getEndpointPath(), e.getReadTimeout().toSeconds());
    }
}
