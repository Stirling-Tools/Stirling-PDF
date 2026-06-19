package stirling.software.proprietary.policy.controller;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.jboss.resteasy.reactive.server.multipart.FormValue;
import org.jboss.resteasy.reactive.server.multipart.MultipartFormDataInput;

import io.github.pixee.security.Filenames;
import io.quarkus.arc.profile.IfBuildProfile;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.sse.OutboundSseEvent;
import jakarta.ws.rs.sse.Sse;
import jakarta.ws.rs.sse.SseEventSink;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.io.FileSystemResource;
import stirling.software.common.model.io.Resource;
import stirling.software.common.model.job.JobResponse;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.engine.PolicyRunHandle;
import stirling.software.proprietary.policy.engine.PolicyRunRegistry;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.engine.PolicyValidator;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.PolicyRunStatus;
import stirling.software.proprietary.policy.model.PolicyRunView;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.security.config.PremiumEndpoint;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/**
 * Policy CRUD plus pipeline runs (stored or ad-hoc). Runs are async: returns a run id, poll {@code
 * GET /run/{runId}} for status, download outputs via {@code GET /api/v1/general/files/{fileId}}.
 *
 * <p>Policies are scoped to a team via {@link PolicyAccessGuard}; whether a user may edit (vs only
 * view/run) is gated by {@link PolicyManagementAuthority} through {@link
 * #requirePolicyEditingAllowed()}.
 */
@Slf4j
@ApplicationScoped
@jakarta.ws.rs.Path("/api/v1/policies")
@Hidden
@PremiumEndpoint
@IfBuildProfile("saas")
@Tag(name = "Policies", description = "Run tool pipelines on the backend")
public class PolicyController {

    @Inject PolicyRunner policyRunner;
    @Inject PolicyRunRegistry runRegistry;
    @Inject PolicyStore policyStore;
    @Inject PolicyValidator policyValidator;
    @Inject PolicyAccessGuard policyAccessGuard;
    @Inject PolicyManagementAuthority policyManagementAuthority;
    @Inject ApplicationProperties applicationProperties;
    @Inject ObjectMapper objectMapper;
    @Inject TempFileManager tempFileManager;
    @Inject JobOwnershipService jobOwnershipService;

    @POST
    @jakarta.ws.rs.Path("/run")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Run a tool pipeline",
            description =
                    "Accepts the documents to process (multipart field 'fileInput'), any supporting"
                            + " files (each under a multipart field named as its asset key, e.g."
                            + " 'company-logo'), and a JSON pipeline definition ('json'). Runs the"
                            + " steps in order asynchronously and returns a run id. Poll the run"
                            + " status endpoint and download outputs via /api/v1/general/files/{id}.")
    public Response run(MultipartFormDataInput request) throws IOException {
        String json = formValue(request, "json");
        PipelineDefinition definition = parseDefinition(json);
        PolicyInputs inputs = collectInputs(request);
        String runId =
                policyRunner.runAdHoc(definition, inputs, PolicyProgressListener.NOOP).runId();
        return Response.status(Response.Status.ACCEPTED)
                .entity(new JobResponse<>(true, runId, null))
                .build();
    }

    @POST
    @jakarta.ws.rs.Path("/run/stream")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.SERVER_SENT_EVENTS)
    @Operation(
            summary = "Run a tool pipeline with live progress",
            description =
                    "Same as /run, but returns Server-Sent Events: a 'step' event as each step"
                            + " starts and completes, then a terminal 'completed', 'failed',"
                            + " 'cancelled', or 'waiting' event carrying the final run view.")
    public void runStream(
            MultipartFormDataInput request, @Context SseEventSink eventSink, @Context Sse sse)
            throws IOException {
        String json = formValue(request, "json");
        PipelineDefinition definition = parseDefinition(json);
        PolicyInputs inputs = collectInputs(request);

        // TODO: Migration required - Spring's SseEmitter supported a configurable timeout
        // (applicationProperties.getPolicies().getStreamTimeoutMs()). JAX-RS SseEventSink has no
        // per-sink timeout; configure via quarkus.http.* / a reverse proxy if a hard cap is needed.

        PolicyRunHandle handle =
                policyRunner.runAdHoc(definition, inputs, streamListener(eventSink, sse));
        // Close the stream with a terminal event once the run finishes. whenComplete runs on the
        // engine's worker thread after the run is done, so this never races the step events.
        handle.completion()
                .whenComplete(
                        (run, throwable) -> {
                            if (throwable != null) {
                                sendEvent(
                                        eventSink,
                                        sse,
                                        "failed",
                                        Map.of("message", throwable.getMessage()));
                            } else {
                                sendEvent(
                                        eventSink,
                                        sse,
                                        terminalEventName(run),
                                        PolicyRunView.of(run));
                            }
                            eventSink.close();
                        });
    }

    @GET
    @jakarta.ws.rs.Path("/run/{runId}")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Get pipeline run status",
            description = "Returns the current status, step cursor, and output files of a run.")
    public Response status(@PathParam("runId") String runId) {
        PolicyRun run = runRegistry.get(runId);
        if (run == null) {
            return Response.status(Response.Status.NOT_FOUND).build();
        }
        return Response.ok(PolicyRunView.of(run)).build();
    }

    @GET
    @jakarta.ws.rs.Path("/runs")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "List the caller's stored-policy runs",
            description =
                    "Returns the caller's in-flight and recently-finished stored-policy runs (within"
                            + " the run-retention window). The frontend reconciles these on load so a"
                            + " run started before a refresh/crash is rediscovered and its outputs"
                            + " collected, rather than orphaned on the backend. Ad-hoc runs (no"
                            + " policy id) are excluded.")
    public List<PolicyRunView> listRuns() {
        return runRegistry.all().stream()
                .filter(run -> run.getPolicyId() != null)
                .filter(run -> ownedByCurrentUser(run.getRunId()))
                .map(PolicyRunView::of)
                .toList();
    }

    /**
     * Whether the run is owned by the current user, derived purely from the existing scoping
     * methods: stripping then re-applying the scope reproduces the run's key only when its owner
     * prefix matches the caller's. No auth (single-user) owns everything. Avoids duplicating the
     * scoped-key format here.
     */
    private boolean ownedByCurrentUser(String runId) {
        return jobOwnershipService
                .createScopedJobKey(jobOwnershipService.extractJobId(runId))
                .equals(runId);
    }

    // --- Policy management ---

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Create or update a policy",
            description =
                    "Stores a policy (trigger config + steps + output + metadata). A blank id is"
                            + " assigned; returns the stored policy with its id.")
    public Response savePolicy(Policy policy) {
        requirePolicyEditingAllowed();
        Policy owned = resolveOwnership(policy);
        try {
            policyValidator.validate(owned);
        } catch (IllegalArgumentException e) {
            throw new WebApplicationException(e.getMessage(), Response.Status.BAD_REQUEST);
        }
        return Response.ok(policyStore.save(owned)).build();
    }

    /**
     * Assign owner + owning team server-side. Create stamps the current user and their team; update
     * preserves the existing owner and team after verifying the policy belongs to the caller's team
     * - so the client can neither forge ownership/team on create nor reach across teams on update
     * (a policy in another team reads as not-found).
     */
    private Policy resolveOwnership(Policy incoming) {
        String id = incoming.id();
        if (id != null && !id.isBlank()) {
            Policy existing = policyStore.get(id).orElse(null);
            if (existing != null) {
                if (!policyAccessGuard.canAccess(existing)) {
                    throw new WebApplicationException(
                            "No policy: " + id, Response.Status.NOT_FOUND);
                }
                return withOwnerAndTeam(incoming, existing.owner(), existing.teamId());
            }
        }
        return withOwnerAndTeam(
                incoming,
                policyAccessGuard.ownerForNewPolicy(),
                policyAccessGuard.teamForNewPolicy());
    }

    private static Policy withOwnerAndTeam(Policy policy, String owner, Long teamId) {
        return new Policy(
                policy.id(),
                policy.name(),
                owner,
                policy.enabled(),
                policy.trigger(),
                policy.sources(),
                policy.steps(),
                policy.output(),
                teamId);
    }

    /**
     * Creating, editing, pausing/resuming, and deleting policies requires the editor role for the
     * caller's team - a team leader on SaaS (see {@link PolicyManagementAuthority}); the global
     * admin gets no say on SaaS. Team scoping (which team's policies) is enforced separately by
     * {@link PolicyAccessGuard}. Every mutation routes through {@link #savePolicy} (pause/resume
     * re-save with a flipped {@code enabled} flag) or {@link #deletePolicy}, so gating those two
     * covers them all; runs ({@code /run}) stay open to the team. Single-user deployments (login
     * disabled) have no such role, so they trust the local operator. The path allowlist for folder
     * sources/outputs is enforced separately by {@link PolicyValidator} at validation time.
     */
    private void requirePolicyEditingAllowed() {
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            return;
        }
        if (!policyManagementAuthority.canEditPolicies()) {
            throw new WebApplicationException(
                    "Policies may only be created or modified by a team leader",
                    Response.Status.FORBIDDEN);
        }
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "List policies",
            description = "Lists the policies belonging to the caller's team.")
    public List<Policy> listPolicies() {
        return policyAccessGuard.visible(policyStore.all());
    }

    @GET
    @jakarta.ws.rs.Path("/{policyId}")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(summary = "Get a policy by id")
    public Response getPolicy(@PathParam("policyId") String policyId) {
        return policyStore
                .get(policyId)
                .filter(policyAccessGuard::canAccess)
                .map(policy -> Response.ok(policy).build())
                .orElseGet(() -> Response.status(Response.Status.NOT_FOUND).build());
    }

    @DELETE
    @jakarta.ws.rs.Path("/{policyId}")
    @Operation(summary = "Delete a policy by id")
    public Response deletePolicy(@PathParam("policyId") String policyId) {
        requirePolicyEditingAllowed();
        // Scope to the caller's team: a policy in another team reads as not-found.
        boolean accessible =
                policyStore.get(policyId).filter(policyAccessGuard::canAccess).isPresent();
        if (accessible && policyStore.delete(policyId)) {
            return Response.noContent().build();
        }
        return Response.status(Response.Status.NOT_FOUND).build();
    }

    @POST
    @jakarta.ws.rs.Path("/{policyId}/run")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Run a stored policy",
            description =
                    "Runs the stored policy's pipeline on the supplied files (primary documents"
                            + " under 'fileInput', supporting files under their asset-key fields)."
                            + " Runs regardless of the policy's enabled flag, which only gates"
                            + " automatic triggering. Returns a run id.")
    public Response runStoredPolicy(
            @PathParam("policyId") String policyId, MultipartFormDataInput request)
            throws IOException {
        Policy policy =
                policyStore
                        .get(policyId)
                        .filter(policyAccessGuard::canAccess)
                        .orElseThrow(
                                () ->
                                        new WebApplicationException(
                                                "No policy: " + policyId,
                                                Response.Status.NOT_FOUND));
        PolicyInputs inputs = collectInputs(request);
        String runId = policyRunner.runWith(policy, inputs, PolicyProgressListener.NOOP).runId();
        return Response.status(Response.Status.ACCEPTED)
                .entity(new JobResponse<>(true, runId, null))
                .build();
    }

    private PipelineDefinition parseDefinition(String json) {
        PipelineDefinition definition;
        try {
            definition = objectMapper.readValue(json, PipelineDefinition.class);
        } catch (JacksonException e) {
            throw new WebApplicationException(
                    "Invalid pipeline definition JSON", Response.Status.BAD_REQUEST);
        }
        if (definition.steps().isEmpty()) {
            throw new WebApplicationException(
                    "Pipeline definition has no steps", Response.Status.BAD_REQUEST);
        }
        return definition;
    }

    /**
     * Extract a single text form field from the multipart request, mirroring Spring's
     * {@code @RequestParam} behaviour (missing field -> 400).
     */
    private static String formValue(MultipartFormDataInput request, String field) {
        Collection<FormValue> values = request.getValues().get(field);
        if (values != null) {
            for (FormValue value : values) {
                if (!value.isFileItem()) {
                    return value.getValue();
                }
            }
        }
        throw new WebApplicationException(
                "Missing required field: " + field, Response.Status.BAD_REQUEST);
    }

    /**
     * Split the multipart file parts into the primary document stream ("fileInput") and the named
     * supporting-file store: every other file field becomes an asset keyed by its field name, which
     * a step references from {@code fileParameters}.
     */
    private PolicyInputs collectInputs(MultipartFormDataInput request) throws IOException {
        Map<String, Collection<FormValue>> formData = request.getValues();
        List<Resource> primary = toResources(formData.get("fileInput"));
        Map<String, List<Resource>> supportingFiles = new LinkedHashMap<>();
        for (Map.Entry<String, Collection<FormValue>> entry : formData.entrySet()) {
            if ("fileInput".equals(entry.getKey())) {
                continue;
            }
            List<Resource> assets = toResources(entry.getValue());
            if (!assets.isEmpty()) {
                supportingFiles.put(entry.getKey(), assets);
            }
        }
        return new PolicyInputs(primary, supportingFiles);
    }

    /**
     * A progress listener that forwards each step transition to the SSE stream as a "step" event.
     */
    private PolicyProgressListener streamListener(SseEventSink eventSink, Sse sse) {
        return new PolicyProgressListener() {
            @Override
            public void onStepStart(int stepIndex, int stepCount, String operation) {
                sendEvent(
                        eventSink,
                        sse,
                        "step",
                        stepEvent("started", stepIndex, stepCount, operation));
            }

            @Override
            public void onStepComplete(int stepIndex, int stepCount, String operation) {
                sendEvent(
                        eventSink,
                        sse,
                        "step",
                        stepEvent("completed", stepIndex, stepCount, operation));
            }
        };
    }

    private static Map<String, Object> stepEvent(
            String phase, int stepIndex, int stepCount, String operation) {
        return Map.of(
                "phase", phase,
                "stepIndex", stepIndex,
                "stepCount", stepCount,
                "operation", operation);
    }

    private static String terminalEventName(PolicyRun run) {
        PolicyRunStatus status = run.getStatus();
        return switch (status) {
            case COMPLETED -> "completed";
            case FAILED -> "failed";
            case CANCELLED -> "cancelled";
            case WAITING_FOR_INPUT -> "waiting";
            default -> "ended";
        };
    }

    private void sendEvent(SseEventSink eventSink, Sse sse, String name, Object data) {
        if (eventSink.isClosed()) {
            log.debug("Dropping policy SSE event '{}': sink already closed", name);
            return;
        }
        try {
            OutboundSseEvent event =
                    sse.newEventBuilder()
                            .name(name)
                            .mediaType(MediaType.APPLICATION_JSON_TYPE)
                            .data(data)
                            .build();
            eventSink.send(event);
        } catch (IllegalStateException e) {
            // Client disconnected or the sink already closed. The run continues and its results
            // remain downloadable via the job endpoints; nothing useful left to stream.
            log.debug("Dropping policy SSE event '{}': {}", name, e.getMessage());
        }
    }

    private List<Resource> toResources(Collection<FormValue> files) throws IOException {
        List<Resource> resources = new ArrayList<>();
        if (files == null) {
            return resources;
        }
        for (FormValue file : files) {
            if (file == null || !file.isFileItem()) {
                continue;
            }
            long size;
            try {
                size = file.getFileItem().getFileSize();
            } catch (IOException e) {
                size = 0;
            }
            if (size == 0) {
                continue;
            }
            TempFile tempFile = tempFileManager.createManagedTempFile("policy-run");
            file.getFileItem().write(tempFile.getPath());
            final String originalName = Filenames.toSimpleFileName(file.getFileName());
            final Path tempPath = tempFile.getPath();
            resources.add(
                    new FileSystemResource(tempPath) {
                        @Override
                        public String getFilename() {
                            return originalName;
                        }
                    });
        }
        return resources;
    }
}
