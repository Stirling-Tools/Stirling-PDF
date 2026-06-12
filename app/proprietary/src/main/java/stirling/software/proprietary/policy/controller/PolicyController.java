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
import stirling.software.common.service.UserServiceInterface;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.proprietary.policy.config.FolderAccessGuard;
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
 * Manages policies and runs pipelines. The premium backend entry point: CRUD for stored {@code
 * Policy} objects, running a stored policy by id, and running an ad-hoc pipeline (for AI/Automate
 * one-offs).
 *
 * <p>Runs execute asynchronously and return a run id immediately. Poll {@code GET /run/{runId}} for
 * status, and download outputs via the existing {@code GET /api/v1/general/files/{fileId}} using
 * the file ids in the run view.
 */
@Slf4j
@ApplicationScoped
@jakarta.ws.rs.Path("/api/v1/policies")
@Hidden
@PremiumEndpoint
@Tag(name = "Policies", description = "Run tool pipelines on the backend")
public class PolicyController {

    @Inject PolicyRunner policyRunner;
    @Inject PolicyRunRegistry runRegistry;
    @Inject PolicyStore policyStore;
    @Inject PolicyValidator policyValidator;
    @Inject FolderAccessGuard folderAccessGuard;
    @Inject UserServiceInterface userService;
    @Inject ApplicationProperties applicationProperties;
    @Inject ObjectMapper objectMapper;
    @Inject TempFileManager tempFileManager;

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

    // --- Policy management ---

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Create or update a policy",
            description =
                    "Stores a policy (trigger config + steps + output + metadata). A blank id is"
                            + " assigned; returns the stored policy with its id.")
    public Response savePolicy(String json) {
        Policy policy = parsePolicy(json);
        requireAuthorizedForFolderAccess(policy);
        try {
            policyValidator.validate(policy);
        } catch (IllegalArgumentException e) {
            throw new WebApplicationException(e.getMessage(), Response.Status.BAD_REQUEST);
        }
        return Response.ok(policyStore.save(policy)).build();
    }

    /**
     * A policy that reads from or writes to a server folder grants whoever saves it access to that
     * path, so restrict it to administrators on multi-user deployments. Single-user deployments
     * (login disabled, e.g. desktop) trust the local operator. The {@link FolderAccessGuard} still
     * enforces SaaS-off and the path allowlist during validation regardless of who saves.
     */
    private void requireAuthorizedForFolderAccess(Policy policy) {
        if (!folderAccessGuard.usesFolderAccess(policy)) {
            return;
        }
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            return;
        }
        if (!userService.isCurrentUserAdmin()) {
            throw new WebApplicationException(
                    "Folder sources and outputs may only be configured by an administrator",
                    Response.Status.FORBIDDEN);
        }
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(summary = "List policies")
    public List<Policy> listPolicies() {
        return policyStore.all();
    }

    @GET
    @jakarta.ws.rs.Path("/{policyId}")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(summary = "Get a policy by id")
    public Response getPolicy(@PathParam("policyId") String policyId) {
        return policyStore
                .get(policyId)
                .map(policy -> Response.ok(policy).build())
                .orElseGet(() -> Response.status(Response.Status.NOT_FOUND).build());
    }

    @DELETE
    @jakarta.ws.rs.Path("/{policyId}")
    @Operation(summary = "Delete a policy by id")
    public Response deletePolicy(@PathParam("policyId") String policyId) {
        return policyStore.delete(policyId)
                ? Response.noContent().build()
                : Response.status(Response.Status.NOT_FOUND).build();
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

    private Policy parsePolicy(String json) {
        try {
            return objectMapper.readValue(json, Policy.class);
        } catch (JacksonException e) {
            throw new WebApplicationException("Invalid policy JSON", Response.Status.BAD_REQUEST);
        }
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
