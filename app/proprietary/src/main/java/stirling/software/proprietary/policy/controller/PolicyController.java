package stirling.software.proprietary.policy.controller;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
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
@RestController
@RequestMapping("/api/v1/policies")
@Hidden
@PremiumEndpoint
@RequiredArgsConstructor
@Tag(name = "Policies", description = "Run tool pipelines on the backend")
public class PolicyController {

    private final PolicyRunner policyRunner;
    private final PolicyRunRegistry runRegistry;
    private final PolicyStore policyStore;
    private final PolicyValidator policyValidator;
    private final FolderAccessGuard folderAccessGuard;
    private final UserServiceInterface userService;
    private final ApplicationProperties applicationProperties;
    private final ObjectMapper objectMapper;
    private final TempFileManager tempFileManager;

    /** SSE emitter timeout, generous enough for long multi-step runs on large files. */
    @Value("${stirling.policies.streamTimeoutMs:1800000}")
    private long streamTimeoutMs;

    @PostMapping(value = "/run", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Run a tool pipeline",
            description =
                    "Accepts the documents to process (multipart field 'fileInput'), any supporting"
                            + " files (each under a multipart field named as its asset key, e.g."
                            + " 'company-logo'), and a JSON pipeline definition ('json'). Runs the"
                            + " steps in order asynchronously and returns a run id. Poll the run"
                            + " status endpoint and download outputs via /api/v1/general/files/{id}.")
    public ResponseEntity<JobResponse<Void>> run(
            @RequestParam("json") String json, MultipartHttpServletRequest request)
            throws IOException {
        PipelineDefinition definition = parseDefinition(json);
        PolicyInputs inputs = collectInputs(request);
        String runId =
                policyRunner.runAdHoc(definition, inputs, PolicyProgressListener.NOOP).runId();
        return ResponseEntity.accepted().body(new JobResponse<>(true, runId, null));
    }

    @PostMapping(value = "/run/stream", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Run a tool pipeline with live progress",
            description =
                    "Same as /run, but returns Server-Sent Events: a 'step' event as each step"
                            + " starts and completes, then a terminal 'completed', 'failed',"
                            + " 'cancelled', or 'waiting' event carrying the final run view.")
    public SseEmitter runStream(
            @RequestParam("json") String json, MultipartHttpServletRequest request)
            throws IOException {
        PipelineDefinition definition = parseDefinition(json);
        PolicyInputs inputs = collectInputs(request);

        SseEmitter emitter = new SseEmitter(streamTimeoutMs);
        emitter.onError(e -> log.warn("Policy run SSE emitter error", e));

        PolicyRunHandle handle = policyRunner.runAdHoc(definition, inputs, streamListener(emitter));
        // Close the stream with a terminal event once the run finishes. whenComplete runs on the
        // engine's worker thread after the run is done, so this never races the step events.
        handle.completion()
                .whenComplete(
                        (run, throwable) -> {
                            if (throwable != null) {
                                sendEvent(
                                        emitter,
                                        "failed",
                                        Map.of("message", throwable.getMessage()));
                            } else {
                                sendEvent(emitter, terminalEventName(run), PolicyRunView.of(run));
                            }
                            emitter.complete();
                        });
        return emitter;
    }

    @GetMapping("/run/{runId}")
    @Operation(
            summary = "Get pipeline run status",
            description = "Returns the current status, step cursor, and output files of a run.")
    public ResponseEntity<PolicyRunView> status(@PathVariable String runId) {
        PolicyRun run = runRegistry.get(runId);
        if (run == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(PolicyRunView.of(run));
    }

    // --- Policy management ---

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Create or update a policy",
            description =
                    "Stores a policy (trigger config + steps + output + metadata). A blank id is"
                            + " assigned; returns the stored policy with its id.")
    public ResponseEntity<Policy> savePolicy(@RequestBody String json) {
        Policy policy = parsePolicy(json);
        requireAuthorizedForFolderAccess(policy);
        try {
            policyValidator.validate(policy);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        return ResponseEntity.ok(policyStore.save(policy));
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
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Folder sources and outputs may only be configured by an administrator");
        }
    }

    @GetMapping
    @Operation(summary = "List policies")
    public List<Policy> listPolicies() {
        return policyStore.all();
    }

    @GetMapping("/{policyId}")
    @Operation(summary = "Get a policy by id")
    public ResponseEntity<Policy> getPolicy(@PathVariable String policyId) {
        return policyStore
                .get(policyId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{policyId}")
    @Operation(summary = "Delete a policy by id")
    public ResponseEntity<Void> deletePolicy(@PathVariable String policyId) {
        return policyStore.delete(policyId)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    @PostMapping(value = "/{policyId}/run", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Run a stored policy",
            description =
                    "Runs the stored policy's pipeline on the supplied files (primary documents"
                            + " under 'fileInput', supporting files under their asset-key fields)."
                            + " Runs regardless of the policy's enabled flag, which only gates"
                            + " automatic triggering. Returns a run id.")
    public ResponseEntity<JobResponse<Void>> runStoredPolicy(
            @PathVariable String policyId, MultipartHttpServletRequest request) throws IOException {
        Policy policy =
                policyStore
                        .get(policyId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "No policy: " + policyId));
        PolicyInputs inputs = collectInputs(request);
        String runId = policyRunner.runWith(policy, inputs, PolicyProgressListener.NOOP).runId();
        return ResponseEntity.accepted().body(new JobResponse<>(true, runId, null));
    }

    private Policy parsePolicy(String json) {
        try {
            return objectMapper.readValue(json, Policy.class);
        } catch (JacksonException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid policy JSON");
        }
    }

    private PipelineDefinition parseDefinition(String json) {
        PipelineDefinition definition;
        try {
            definition = objectMapper.readValue(json, PipelineDefinition.class);
        } catch (JacksonException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Invalid pipeline definition JSON");
        }
        if (definition.steps().isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Pipeline definition has no steps");
        }
        return definition;
    }

    /**
     * Split the multipart file parts into the primary document stream ("fileInput") and the named
     * supporting-file store: every other file field becomes an asset keyed by its field name, which
     * a step references from {@code fileParameters}.
     */
    private PolicyInputs collectInputs(MultipartHttpServletRequest request) throws IOException {
        MultiValueMap<String, MultipartFile> fileMap = request.getMultiFileMap();
        List<Resource> primary = toResources(fileMap.get("fileInput"));
        Map<String, List<Resource>> supportingFiles = new LinkedHashMap<>();
        for (Map.Entry<String, List<MultipartFile>> entry : fileMap.entrySet()) {
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
    private PolicyProgressListener streamListener(SseEmitter emitter) {
        return new PolicyProgressListener() {
            @Override
            public void onStepStart(int stepIndex, int stepCount, String operation) {
                sendEvent(emitter, "step", stepEvent("started", stepIndex, stepCount, operation));
            }

            @Override
            public void onStepComplete(int stepIndex, int stepCount, String operation) {
                sendEvent(emitter, "step", stepEvent("completed", stepIndex, stepCount, operation));
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

    private void sendEvent(SseEmitter emitter, String name, Object data) {
        try {
            emitter.send(SseEmitter.event().name(name).data(data, MediaType.APPLICATION_JSON));
        } catch (IOException | IllegalStateException e) {
            // Client disconnected or the emitter already closed. The run continues and its results
            // remain downloadable via the job endpoints; nothing useful left to stream.
            log.debug("Dropping policy SSE event '{}': {}", name, e.getMessage());
        }
    }

    private List<Resource> toResources(List<MultipartFile> files) throws IOException {
        List<Resource> resources = new ArrayList<>();
        if (files == null) {
            return resources;
        }
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) {
                continue;
            }
            TempFile tempFile = tempFileManager.createManagedTempFile("policy-run");
            file.transferTo(tempFile.getPath());
            final String originalName = Filenames.toSimpleFileName(file.getOriginalFilename());
            resources.add(
                    new FileSystemResource(tempFile.getFile()) {
                        @Override
                        public String getFilename() {
                            return originalName;
                        }
                    });
        }
        return resources;
    }
}
