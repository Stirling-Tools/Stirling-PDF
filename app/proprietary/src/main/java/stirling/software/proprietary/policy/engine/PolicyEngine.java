package stirling.software.proprietary.policy.engine;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;

import org.slf4j.MDC;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.ResultFile;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.InternalApiTimeoutException;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.service.JobQueue;
import stirling.software.common.service.ResourceMonitor;
import stirling.software.common.service.TaskManager;
import stirling.software.common.util.ExecutorFactory;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.WaitState;
import stirling.software.proprietary.policy.output.PolicyOutputSink;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;

/**
 * Runs pipelines asynchronously as tracked jobs. {@link #submit} returns a run id immediately; the
 * pipeline runs on a virtual thread (so a step blocked on a slow tool does not hold a platform
 * thread). Drives {@link PolicyExecutor} for the step loop, projects status/outputs into {@link
 * TaskManager} (existing job endpoints work unchanged), and keeps live state in {@link
 * PolicyRunRegistry}.
 *
 * <p>Manages its own virtual-thread execution rather than {@code JobExecutorService}, which
 * force-completes a job once its work returns: incompatible with a run that suspends in {@code
 * WAITING_FOR_INPUT}. Still applies the shared {@link ResourceMonitor}/{@link JobQueue} admission
 * control so heavy runs queue under load.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PolicyEngine {

    // Admission weight for one run. Weighted heavy: a run chains many tools and holds intermediate
    // files. See ResourceMonitor#shouldQueueJob(int).
    private static final int RUN_RESOURCE_WEIGHT = 50;

    private final PolicyExecutor stepExecutor;
    private final TaskManager taskManager;
    private final PolicyRunRegistry registry;
    private final FileStorage fileStorage;
    private final JobOwnershipService jobOwnershipService;
    private final List<PolicyOutputSink> outputSinks;
    private final ResourceMonitor resourceMonitor;
    private final JobQueue jobQueue;

    private final ExecutorService asyncExecutor = ExecutorFactory.newVirtualThreadExecutor();

    /**
     * Submit a pipeline to run asynchronously. The handle's run id scopes a {@link TaskManager} job
     * (status/notes/results observable via the job endpoints); its future resolves when the run
     * reaches a terminal or paused state.
     */
    public PolicyRunHandle submit(
            PipelineDefinition definition, PolicyInputs inputs, PolicyProgressListener listener) {
        // Ad-hoc run (no stored policy): bill whoever kicked it off. Capture the principal on this
        // (request) thread — it does not survive the hop onto the async worker.
        return submitForPrincipal(currentActingPrincipal(), definition, inputs, listener);
    }

    /** Run a stored policy on demand. {@code enabled} gates triggers, not explicit runs. */
    public PolicyRunHandle runPolicy(
            Policy policy, PolicyInputs inputs, PolicyProgressListener listener) {
        // Bill the policy owner. Trigger-fired runs have no security context at all, and even an
        // on-demand run executes on a background worker that doesn't inherit the caller's context —
        // so the owner (a username stamped at policy creation) is the reliable billing identity.
        return submitForPrincipal(policy.owner(), policy.toDefinition(), inputs, listener);
    }

    private PolicyRunHandle submitForPrincipal(
            String actingPrincipal,
            PipelineDefinition definition,
            PolicyInputs inputs,
            PolicyProgressListener listener) {
        // Scope the run id to the current user (this request thread) so the file-download
        // ownership check passes. No-op when security is off.
        String runId = jobOwnershipService.createScopedJobKey(UUID.randomUUID().toString());
        taskManager.createTask(runId);
        PolicyRun run = new PolicyRun(runId, definition);
        registry.register(run);
        CompletableFuture<PolicyRun> completion = new CompletableFuture<>();
        PolicyProgressListener tracking = trackingListener(runId, run, listener);
        // Re-establish the acting principal as the audit principal on the worker thread. Each tool
        // step dispatches via InternalApiClient, which resolves the caller from
        // UserService.getCurrentUsername() — that has an MDC `auditPrincipal` fallback for async
        // threads. Without this the worker has no identity, tool calls fall back to the
        // INTERNAL_API_USER, and PAYG charges that system account instead of the owner's team.
        Runnable task =
                () ->
                        runAsPrincipal(
                                actingPrincipal,
                                () -> runToCompletion(run, inputs, tracking, completion));

        // One admission unit per run; steps run synchronously within it, so this gates heavy work
        // without the pool-within-pool risk of queueing each tool call.
        if (resourceMonitor.shouldQueueJob(RUN_RESOURCE_WEIGHT)) {
            log.debug("Queueing policy run {} under resource pressure", runId);
            jobQueue.queueJob(
                            runId,
                            RUN_RESOURCE_WEIGHT,
                            () -> {
                                task.run();
                                return null;
                            },
                            0L)
                    .exceptionally(ex -> failRejectedRun(run, completion, ex));
        } else {
            asyncExecutor.execute(task);
        }
        return new PolicyRunHandle(runId, completion);
    }

    public PolicyRun getRun(String runId) {
        return registry.get(runId);
    }

    /**
     * Mark a run cancelled if not already finished. Does not yet interrupt an in-flight tool call.
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

    /** Resume a run paused in {@code WAITING_FOR_INPUT}. Not yet implemented. */
    public String resume(String runId, List<Resource> additionalInputs) {
        throw new UnsupportedOperationException("Pause/resume is not yet implemented");
    }

    private void runToCompletion(
            PolicyRun run,
            PolicyInputs inputs,
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
            // Expected path: suspend rather than fail. Persist intermediates as fileIds so the run
            // can resume after this worker thread is gone.
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
        } catch (RestClientResponseException e) {
            // A downstream tool call returned an error status. When it's a structured entitlement
            // response (401/402 with a JSON `error` sentinel), surface that code onto the run so
            // the
            // client can react — e.g. pop the usage-limit modal — instead of only seeing a generic
            // failure. We don't interpret the code here (that would couple this module to the saas
            // billing layer); we just pass it through for the client to map. Other statuses fall
            // through to the generic failure below.
            String code = extractDownstreamErrorCode(e);
            if (code != null) {
                log.info("Policy run {} blocked by downstream entitlement gate ({})", runId, code);
                String message = "Usage limit reached";
                run.failWithCode(message, code, extractDownstreamSubscribed(e));
                taskManager.setError(runId, message);
            } else {
                String message = "Policy run failed: " + e.getMessage();
                log.error("Policy run {} failed (downstream HTTP error)", runId, e);
                run.fail(message);
                taskManager.setError(runId, message);
            }
        } catch (Exception e) {
            String message = "Policy run failed: " + e.getMessage();
            log.error("Policy run {} failed", runId, e);
            run.fail(message);
            taskManager.setError(runId, message);
        } finally {
            // Always resolve so stream/await callers unblock.
            completion.complete(run);
        }
    }

    private ResponseEntity<?> failRejectedRun(
            PolicyRun run, CompletableFuture<PolicyRun> completion, Throwable ex) {
        // Only reached if the run never started (e.g. queue full); a started run resolves its own
        // completion in runToCompletion.
        if (!completion.isDone()) {
            String message = "Policy run could not be queued: " + ex.getMessage();
            log.error("Policy run {} was not admitted: {}", run.getRunId(), ex.getMessage());
            run.fail(message);
            taskManager.setError(run.getRunId(), message);
            completion.complete(run);
        }
        return null;
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

    /** Matches the {@code "error":"CODE"} field of a small JSON error body. */
    private static final java.util.regex.Pattern ERROR_CODE_FIELD =
            java.util.regex.Pattern.compile("\"error\"\\s*:\\s*\"([^\"]+)\"");

    /**
     * Pull the {@code error} sentinel out of a downstream 401/402 JSON body — e.g. the saas
     * EntitlementGuard's {@code {"error":"PAYG_LIMIT_REACHED",...}}. Regex (not a JSON parse) on
     * purpose: the body is a small, server-controlled shape and this keeps the proprietary module
     * free of any billing-layer coupling. Returns null for other statuses or an unmatched body, in
     * which case the caller treats it as a generic failure.
     */
    private static String extractDownstreamErrorCode(RestClientResponseException e) {
        int status = e.getStatusCode().value();
        if (status != 401 && status != 402) {
            return null;
        }
        String body = e.getResponseBodyAsString();
        if (body == null || body.isBlank()) {
            return null;
        }
        java.util.regex.Matcher m = ERROR_CODE_FIELD.matcher(body);
        return m.find() ? m.group(1) : null;
    }

    /** Matches the {@code "subscribed":true|false} field of a small JSON error body. */
    private static final java.util.regex.Pattern SUBSCRIBED_FIELD =
            java.util.regex.Pattern.compile("\"subscribed\"\\s*:\\s*(true|false)");

    /**
     * Pull the {@code subscribed} flag out of a downstream 401/402 JSON body (present on the saas
     * {@code PAYG_LIMIT_REACHED} response). Null when absent — the client then defaults to the
     * free-limit modal. Regex for the same dependency-free reason as {@link
     * #extractDownstreamErrorCode}.
     */
    private static Boolean extractDownstreamSubscribed(RestClientResponseException e) {
        String body = e.getResponseBodyAsString();
        if (body == null || body.isBlank()) {
            return null;
        }
        java.util.regex.Matcher m = SUBSCRIBED_FIELD.matcher(body);
        return m.find() ? Boolean.valueOf(m.group(1)) : null;
    }

    /**
     * MDC key {@code UserService.getCurrentUsername()} reads as its async fallback (stamped by the
     * controller audit aspect on request threads). We reuse it to carry the billing identity onto
     * the policy worker thread.
     */
    private static final String AUDIT_PRINCIPAL_MDC_KEY = "auditPrincipal";

    /**
     * The username to bill an ad-hoc run to, captured on the submitting (request) thread. Prefers
     * the audit principal the controller aspect already stamped; falls back to the security context
     * name. {@code anonymousUser} (and no identity) resolve to null so we don't try to bill it.
     */
    private static String currentActingPrincipal() {
        String mdc = MDC.get(AUDIT_PRINCIPAL_MDC_KEY);
        if (mdc != null && !mdc.isBlank()) {
            return mdc;
        }
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            return null;
        }
        String name = auth.getName();
        return "anonymousUser".equals(name) ? null : name;
    }

    /**
     * Run {@code body} with {@code principal} set as the audit principal in MDC, so async tool
     * dispatch attributes (and charges) usage to that user. A null/blank principal runs as-is.
     * Restores the previous MDC value afterward (defensive — worker threads aren't pooled).
     */
    private static void runAsPrincipal(String principal, Runnable body) {
        if (principal == null || principal.isBlank()) {
            body.run();
            return;
        }
        String previous = MDC.get(AUDIT_PRINCIPAL_MDC_KEY);
        MDC.put(AUDIT_PRINCIPAL_MDC_KEY, principal);
        try {
            body.run();
        } finally {
            if (previous != null) {
                MDC.put(AUDIT_PRINCIPAL_MDC_KEY, previous);
            } else {
                MDC.remove(AUDIT_PRINCIPAL_MDC_KEY);
            }
        }
    }
}
