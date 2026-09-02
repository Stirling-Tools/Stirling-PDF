package stirling.software.proprietary.policy.engine;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

import jakarta.annotation.PreDestroy;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.ResultFile;
import stirling.software.common.service.AutomationRunContext;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.service.InternalApiTimeoutException;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.service.JobQueue;
import stirling.software.common.service.ResourceMonitor;
import stirling.software.common.service.TaskManager;
import stirling.software.common.util.ExecutorFactory;
import stirling.software.common.util.JobContext;
import stirling.software.proprietary.document.DocumentFacts;
import stirling.software.proprietary.failure.FailureKind;
import stirling.software.proprietary.failure.PolicyFailureRecorder;
import stirling.software.proprietary.policy.asset.PolicyAssetResolver;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.RoutedDestination;
import stirling.software.proprietary.policy.model.WaitState;
import stirling.software.proprietary.policy.output.OutputDelivery;
import stirling.software.proprietary.policy.output.PolicyOutputResolver;
import stirling.software.proprietary.policy.output.PolicyOutputSink;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.policy.routing.RoutingRuleMatcher;
import stirling.software.proprietary.service.DownstreamEntitlementError;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

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

    // errorCode marking a run that was never admitted (job queue full under load). Transient: the
    // client treats it as "busy" and retries, rather than as a terminal processing failure.
    private static final String QUEUE_FULL_CODE = "POLICY_QUEUE_FULL";

    private final PolicyExecutor stepExecutor;
    private final TaskManager taskManager;
    private final PolicyRunRegistry registry;
    // Durable record of why a run failed. Best-effort by contract: see PolicyFailureRecorder.
    private final PolicyFailureRecorder failureRecorder;
    private final FileStorage fileStorage;
    private final JobOwnershipService jobOwnershipService;
    private final List<PolicyOutputSink> outputSinks;
    private final PolicyOutputResolver outputResolver;
    private final ResourceMonitor resourceMonitor;
    private final JobQueue jobQueue;
    private final PolicyAssetResolver assetResolver;

    private final ExecutorService asyncExecutor = ExecutorFactory.newVirtualThreadExecutor();

    // Builds the per-document facts routing rules match against. Stateless, so a shared instance.
    private static final ObjectMapper FACTS_MAPPER = JsonMapper.builder().build();

    /** Stop the service-owned executor when the application context is closed or restarted. */
    @PreDestroy
    void shutdown() {
        log.debug("Shutting down policy engine executor");
        asyncExecutor.shutdown();
        try {
            if (!asyncExecutor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS)) {
                asyncExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            asyncExecutor.shutdownNow();
        }
    }

    /**
     * Submit a pipeline to run asynchronously. The handle's run id scopes a {@link TaskManager} job
     * (status/notes/results observable via the job endpoints); its future resolves when the run
     * reaches a terminal or paused state.
     */
    public PolicyRunHandle submit(
            PipelineDefinition definition, PolicyInputs inputs, PolicyProgressListener listener) {
        return submit(definition, inputs, listener, null);
    }

    /**
     * As {@link #submit(PipelineDefinition, PolicyInputs, PolicyProgressListener)}, recording the
     * originating stored policy's id on the run ({@code null} for ad-hoc pipelines). The id lets a
     * client attribute a run it rediscovers via {@code GET /policies/runs} after losing local state
     * (e.g. a refresh before it recorded the run), so a finished run is never orphaned server-side.
     */
    public PolicyRunHandle submit(
            PipelineDefinition definition,
            PolicyInputs inputs,
            PolicyProgressListener listener,
            String policyId) {
        // Ad-hoc run (no stored policy): bill whoever kicked it off and own the outputs as them
        // too.
        // Capture the principal on this (request) thread — it does not survive the hop onto the
        // async
        // worker.
        String principal = currentActingPrincipal();
        return submitForPrincipal(
                principal,
                principal,
                principal,
                policyId,
                definition,
                inputs,
                listener,
                null,
                null);
    }

    /** Run a stored policy on demand. {@code enabled} gates triggers, not explicit runs. */
    public PolicyRunHandle runPolicy(
            Policy policy, PolicyInputs inputs, PolicyProgressListener listener) {
        return runPolicy(policy, inputs, listener, null, null);
    }

    /**
     * As {@link #runPolicy(Policy, PolicyInputs, PolicyProgressListener)}, recording which source
     * fed the run and its opaque reference to the document. The first says where an unattended
     * failure came from; the second says which document, and is what lets the same document failing
     * again fold into one incident. With no source {@code fileIdentity} is the client's own
     * reference, with one it is that source's hash; this engine only carries it either way.
     */
    public PolicyRunHandle runPolicy(
            Policy policy,
            PolicyInputs inputs,
            PolicyProgressListener listener,
            String sourceId,
            String fileIdentity) {
        // Bill the policy owner: trigger-fired runs have no security context, and the async worker
        // doesn't inherit the caller's, so the owner (stamped at policy creation) is the reliable
        // billing identity — and for org-wide policies the org/owner is meant to pay. But own the
        // OUTPUT files as the user who triggered the run (captured here on the request thread) so
        // they can download their enforced file; otherwise an org-wide policy's output is owned by
        // the admin and the triggering user is denied it. Trigger-fired runs have no such user, so
        // the owner owns those outputs.
        //
        // The triggering user is also carried on the run, as the actor of any failure it records:
        // null for a trigger-fired run, which is what makes an unattended incident ownerless rather
        // than the owner's problem. Three identities, deliberately not interchangeable.
        String triggeringUser = currentActingPrincipal();
        String fileOwner = triggeringUser != null ? triggeringUser : policy.owner();
        // Stored supporting files (certificates, watermark images, ...) load here, before the
        // async hop: worker threads have no principal, so assets bind by the policy's own team.
        PolicyInputs resolved = assetResolver.resolve(policy, inputs);
        // Resolve the referenced output destinations live (like sourceIds), so a stored policy
        // delivers to each of its saved Source destinations. Unreferenced policies fall back to
        // their inline output.
        PipelineDefinition definition =
                new PipelineDefinition(
                        policy.name(),
                        policy.steps(),
                        outputResolver.resolve(policy),
                        outputResolver.resolveRouting(policy));
        return submitForPrincipal(
                policy.owner(),
                fileOwner,
                triggeringUser,
                policy.id(),
                definition,
                // main's asset-resolved inputs, not the raw ones: stored certificates and watermark
                // images bind here, before the async hop, because worker threads have no principal.
                resolved,
                listener,
                sourceId,
                fileIdentity);
    }

    private PolicyRunHandle submitForPrincipal(
            String billingPrincipal,
            String fileOwner,
            String triggeringUser,
            String policyId,
            PipelineDefinition definition,
            PolicyInputs inputs,
            PolicyProgressListener listener,
            String sourceId,
            String fileIdentity) {
        // Scope the run id to the current user (this request thread) so the file-download
        // ownership check passes. No-op when security is off.
        String runId = jobOwnershipService.createScopedJobKey(UUID.randomUUID().toString());
        taskManager.createTask(runId);
        // Tag the shared job entry with the policy id so peers can list it as a policy run.
        if (policyId != null) {
            taskManager.putMetadata(runId, "policyId", policyId);
        }
        PolicyRun run =
                new PolicyRun(runId, policyId, definition, sourceId, fileIdentity, triggeringUser);
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
                                billingPrincipal,
                                fileOwner,
                                definition.name(),
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
        // One policy run = one automation run. Scope the run id on this worker thread (the async
        // hop already happened) so every tool sub-step dispatched via InternalApiClient groups into
        // a single charge, and two separate policy runs on the same document stay distinct charges.
        try (AutomationRunContext.Scope runScope = AutomationRunContext.open(runId)) {
            try {
                run.markRunning();
                PolicyExecutionResult result =
                        stepExecutor.execute(run.getDefinition(), inputs, listener);
                List<ResultFile> outputs = deliver(run, runId, result.files());
                taskManager.setMultipleFileResults(runId, outputs);
                taskManager.setComplete(runId);
                run.complete(outputs);
            } catch (PolicyInputRequiredException e) {
                // Expected path: suspend rather than fail. Persist intermediates as fileIds so the
                // run
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
                recordFailure(run, message, e);
            } catch (RestClientResponseException e) {
                // A downstream tool call returned an error status. When it's a structured
                // entitlement
                // response (401/402 with a JSON `error` sentinel), surface that code onto the run
                // so
                // the
                // client can react — e.g. pop the usage-limit modal — instead of only seeing a
                // generic
                // failure. We don't interpret the code here (that would couple this module to the
                // saas
                // billing layer); we just pass it through for the client to map. Other statuses
                // fall
                // through to the generic failure below.
                String code = DownstreamEntitlementError.extractCode(e);
                if (code != null) {
                    log.info(
                            "Policy run {} blocked by downstream entitlement gate ({})",
                            runId,
                            code);
                    String message = "Usage limit reached";
                    run.failWithCode(
                            message, code, DownstreamEntitlementError.extractSubscribed(e));
                    taskManager.setError(runId, message);
                    recordFailure(run, message, e);
                } else {
                    String message = "Policy run failed: " + e.getMessage();
                    log.error("Policy run {} failed (downstream HTTP error)", runId, e);
                    run.fail(message);
                    taskManager.setError(runId, message);
                    recordFailure(run, message, e);
                }
            } catch (Exception e) {
                String message = "Policy run failed: " + e.getMessage();
                log.error("Policy run {} failed", runId, e);
                run.fail(message);
                taskManager.setError(runId, message);
                recordFailure(run, message, e);
            } finally {
                // Always resolve so stream/await callers unblock.
                completion.complete(run);
            }
        }
    }

    private ResponseEntity<?> failRejectedRun(
            PolicyRun run, CompletableFuture<PolicyRun> completion, Throwable ex) {
        // Only reached if the run never started (e.g. queue full); a started run resolves its own
        // completion in runToCompletion.
        if (!completion.isDone()) {
            String message = "Policy run could not be queued: " + ex.getMessage();
            log.error("Policy run {} was not admitted: {}", run.getRunId(), ex.getMessage());
            // Transient admission rejection, not a processing failure (see QUEUE_FULL_CODE).
            run.failWithCode(message, QUEUE_FULL_CODE, null);
            taskManager.setError(run.getRunId(), message);
            // No exception to classify here: nothing was thrown by a tool, the run simply was not
            // admitted. Record it explicitly so a run lost to load pressure is still accounted for.
            // Attributed like any other failure: a user whose run was refused is still the person
            // holding that document, and an unattended sweep's run carries no triggering user.
            failureRecorder.recordRunFailureAs(
                    FailureKind.UNKNOWN,
                    run.getRunId(),
                    run.getPolicyId(),
                    run.getSourceId(),
                    run.getTriggeringUser(),
                    message);
            completion.complete(run);
        }
        return null;
    }

    /**
     * Record why a run failed. Called after the run's own state transition and task-manager update,
     * so a recording problem cannot change the outcome the caller observes.
     *
     * <p>The actor is the run's triggering user, not the MDC audit principal: that carries the
     * BILLING identity, which for a stored policy is always its owner. Reading it here filed every
     * failure under the owner — hiding an attended failure from the member who caused it and holds
     * the document, and leaving an unattended sweep's failure looking attended.
     */
    private void recordFailure(PolicyRun run, String message, Throwable cause) {
        failureRecorder.recordRunFailure(
                run.getRunId(),
                run.getPolicyId(),
                run.getSourceId(),
                run.getFileIdentity(),
                run.getTriggeringUser(),
                message,
                cause);
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

    /**
     * Deliver a finished run's files. Without routing rules every file goes to every destination.
     * With them, each file is matched against the rules in order and delivered to the first
     * destination that claims it (a file no rule claims falls back to the run's outputs). Files are
     * grouped by destination so a sink - which sets up a connection per call - is called once each.
     */
    private List<ResultFile> deliver(PolicyRun run, String runId, List<Resource> files)
            throws IOException {
        OutputDelivery delivery = new OutputDelivery(runId, run.getPolicyId());
        List<OutputSpec> fallback = run.getDefinition().outputs();
        if (fallback.isEmpty()) {
            // No destinations means inline delivery (results returned to the caller), preserving
            // ad-hoc/AI behaviour.
            fallback = List.of(OutputSpec.inline());
        }
        List<RoutedDestination> routing = run.getDefinition().routing();
        if (routing.isEmpty()) {
            return deliverGrouped(delivery, groupedToAll(files, fallback));
        }
        Map<OutputSpec, List<Resource>> byDestination = new LinkedHashMap<>();
        for (Resource file : files) {
            JsonNode facts = DocumentFacts.of(file, FACTS_MAPPER);
            for (OutputSpec target : destinationsFor(routing, fallback, facts)) {
                byDestination.computeIfAbsent(target, key -> new ArrayList<>()).add(file);
            }
        }
        return deliverGrouped(delivery, byDestination);
    }

    /** The destination(s) a document goes to: the first matching rule's, or the fallback. */
    private static List<OutputSpec> destinationsFor(
            List<RoutedDestination> routing, List<OutputSpec> fallback, JsonNode facts) {
        for (RoutedDestination routed : routing) {
            if (RoutingRuleMatcher.matches(routed.rule(), facts)) {
                return List.of(routed.destination());
            }
        }
        return fallback;
    }

    private static Map<OutputSpec, List<Resource>> groupedToAll(
            List<Resource> files, List<OutputSpec> destinations) {
        Map<OutputSpec, List<Resource>> byDestination = new LinkedHashMap<>();
        for (OutputSpec destination : destinations) {
            byDestination.put(destination, files);
        }
        return byDestination;
    }

    private List<ResultFile> deliverGrouped(
            OutputDelivery delivery, Map<OutputSpec, List<Resource>> byDestination)
            throws IOException {
        List<ResultFile> outputs = new ArrayList<>();
        for (Map.Entry<OutputSpec, List<Resource>> entry : byDestination.entrySet()) {
            outputs.addAll(
                    sinkFor(entry.getKey()).deliver(delivery, entry.getValue(), entry.getKey()));
        }
        return outputs;
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
    private static void runAsPrincipal(
            String billingPrincipal, String fileOwner, String policyName, Runnable body) {
        // Billing identity (MDC auditPrincipal) and output-file ownership (JobContext owner) are
        // set
        // independently: usage is charged to billingPrincipal, but stored output files are owned by
        // fileOwner — the user who triggered an org-wide policy — so they can fetch their results.
        // Either may be null (e.g. login disabled, or a trigger-fired run); each is applied only
        // when present and restored afterward (defensive — worker threads aren't pooled). The
        // policy
        // name rides MDC too so each tool step's loopback dispatch (InternalApiClient) can forward
        // it as a header, letting the audit tie the step back to its policy.
        String previousPrincipal = MDC.get(AUDIT_PRINCIPAL_MDC_KEY);
        String previousPolicyName = MDC.get(InternalApiClient.POLICY_NAME_MDC_KEY);
        String previousOwner = JobContext.getOwner();
        if (billingPrincipal != null && !billingPrincipal.isBlank()) {
            MDC.put(AUDIT_PRINCIPAL_MDC_KEY, billingPrincipal);
        }
        if (policyName != null && !policyName.isBlank()) {
            MDC.put(InternalApiClient.POLICY_NAME_MDC_KEY, policyName);
        }
        if (fileOwner != null && !fileOwner.isBlank()) {
            JobContext.setOwner(fileOwner);
        }
        try {
            body.run();
        } finally {
            if (previousPrincipal != null) {
                MDC.put(AUDIT_PRINCIPAL_MDC_KEY, previousPrincipal);
            } else {
                MDC.remove(AUDIT_PRINCIPAL_MDC_KEY);
            }
            if (previousPolicyName != null) {
                MDC.put(InternalApiClient.POLICY_NAME_MDC_KEY, previousPolicyName);
            } else {
                MDC.remove(InternalApiClient.POLICY_NAME_MDC_KEY);
            }
            JobContext.setOwner(previousOwner);
        }
    }
}
