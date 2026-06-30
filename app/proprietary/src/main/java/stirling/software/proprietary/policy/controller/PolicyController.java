package stirling.software.proprietary.policy.controller;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
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
import stirling.software.proprietary.policy.overview.PoliciesOverviewResponse;
import stirling.software.proprietary.policy.overview.PolicyOverviewService;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.policy.source.SourceAccessGuard;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.policy.trigger.PolicyTrigger;
import stirling.software.proprietary.policy.trigger.PolicyTriggerManager;
import stirling.software.proprietary.policy.trigger.TriggerInfo;

/**
 * Policy CRUD plus pipeline runs (stored or ad-hoc). Runs are async: returns a run id, poll {@code
 * GET /run/{runId}} for status, download outputs via {@code GET /api/v1/general/files/{fileId}}.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/policies")
@Hidden
@RequiredArgsConstructor
@Tag(name = "Policies", description = "Run tool pipelines on the backend")
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class PolicyController {

    private final PolicyRunner policyRunner;
    private final PolicyRunRegistry runRegistry;
    private final PolicyStore policyStore;
    private final SourceStore sourceStore;
    private final SourceAccessGuard sourceAccessGuard;
    private final PolicyValidator policyValidator;
    private final PolicyAccessGuard policyAccessGuard;
    private final PolicyManagementAuthority policyManagementAuthority;
    private final PolicyTriggerManager policyTriggerManager;
    private final PolicyOverviewService policyOverviewService;
    private final List<PolicyTrigger> policyTriggers;
    private final ApplicationProperties applicationProperties;
    private final TempFileManager tempFileManager;
    private final JobOwnershipService jobOwnershipService;

    @PostMapping(value = "/run", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Run a tool pipeline",
            description =
                    "Accepts the documents to process (multipart field 'fileInput'), any supporting"
                            + " files (under 'assets[i].key' / 'assets[i].file'), and the pipeline"
                            + " definition as an application/json part named 'json'. Runs the steps"
                            + " in order asynchronously and returns a run id. Poll the run status"
                            + " endpoint and download outputs via /api/v1/general/files/{id}.")
    public ResponseEntity<JobResponse<Void>> run(
            @RequestPart("json") PipelineDefinition definition,
            @Valid @ModelAttribute PolicyRunFiles files)
            throws IOException {
        requireRunnable(definition);
        PolicyInputs inputs = toInputs(files);
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
            @RequestPart("json") PipelineDefinition definition,
            @Valid @ModelAttribute PolicyRunFiles files)
            throws IOException {
        requireRunnable(definition);
        PolicyInputs inputs = toInputs(files);

        SseEmitter emitter =
                new SseEmitter(applicationProperties.getPolicies().getStreamTimeoutMs());
        emitter.onError(e -> log.warn("Policy run SSE emitter error", e));

        PolicyRunHandle handle = policyRunner.runAdHoc(definition, inputs, streamListener(emitter));
        // whenComplete runs on the worker thread after the run finishes, so the terminal event
        // never races the step events.
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

    @GetMapping("/runs")
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

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Create or update a policy",
            description =
                    "Stores a policy (trigger config + steps + output + metadata). A blank id is"
                            + " assigned; returns the stored policy with its id.")
    public ResponseEntity<Policy> savePolicy(@RequestBody Policy policy) {
        requirePolicyEditingAllowed();
        Policy owned = resolveOwnership(policy);
        requireAccessibleSources(owned);
        try {
            policyValidator.validate(owned);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        Policy saved = policyStore.save(owned);
        // Re-sync trigger registrations now so a new/changed folder-watch policy starts being
        // watched immediately instead of after the next reconcile sweep.
        policyTriggerManager.notifyPoliciesChanged();
        return ResponseEntity.ok(saved);
    }

    /**
     * Every {@code sourceId} a policy references must resolve to a source in the caller's team, so
     * a client can neither reference a non-existent source nor reach across teams to use another
     * team's connection. A bad reference is a client error.
     */
    private void requireAccessibleSources(Policy policy) {
        for (String sourceId : policy.sourceIds()) {
            boolean accessible =
                    sourceStore.get(sourceId).filter(sourceAccessGuard::canAccess).isPresent();
            if (!accessible) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Unknown or inaccessible source: " + sourceId);
            }
        }
    }

    /**
     * Assign owner + owning team server-side. Create stamps the current user and their team; update
     * preserves the existing owner and team after verifying the policy belongs to the caller's team
     * — so the client can neither forge ownership/team on create nor reach across teams on update
     * (a policy in another team reads as not-found).
     */
    private Policy resolveOwnership(Policy incoming) {
        String id = incoming.id();
        if (id != null && !id.isBlank()) {
            Policy existing = policyStore.get(id).orElse(null);
            if (existing != null) {
                if (!policyAccessGuard.canAccess(existing)) {
                    throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No policy: " + id);
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
                policy.sourceIds(),
                policy.steps(),
                policy.output(),
                teamId);
    }

    /**
     * Creating, editing, pausing/resuming, and deleting policies requires the editor role for the
     * caller's team — a team leader on SaaS (see {@link PolicyManagementAuthority}); the global
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
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Policies may only be created or modified by a team leader");
        }
    }

    @GetMapping
    @Operation(
            summary = "List policies",
            description = "Lists the policies belonging to the caller's team.")
    public List<Policy> listPolicies() {
        return policyAccessGuard.visibleFrom(policyStore);
    }

    @GetMapping("/overview")
    @Operation(
            summary = "Pipelines overview",
            description =
                    "Returns the KPI strip plus one row per policy the caller's team owns, each with"
                            + " its referenced sources resolved to names, its pipeline steps, and a"
                            + " trigger/output summary. Backs the portal's all-pipelines surface.")
    public PoliciesOverviewResponse overview() {
        return policyOverviewService.overview();
    }

    @GetMapping("/triggers")
    @Operation(
            summary = "List available triggers",
            description =
                    "Lists each trigger kind with whether it needs a source and which source types"
                            + " it supports, so the UI can offer triggers and pair them with the"
                            + " right sources.")
    public List<TriggerInfo> triggers() {
        return policyTriggers.stream()
                .map(TriggerInfo::of)
                .sorted(Comparator.comparing(TriggerInfo::type))
                .toList();
    }

    @GetMapping("/{policyId}")
    @Operation(summary = "Get a policy by id")
    public ResponseEntity<Policy> getPolicy(@PathVariable String policyId) {
        return policyStore
                .get(policyId)
                .filter(policyAccessGuard::canAccess)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{policyId}")
    @Operation(summary = "Delete a policy by id")
    public ResponseEntity<Void> deletePolicy(@PathVariable String policyId) {
        requirePolicyEditingAllowed();
        // Scope to the caller's team: a policy in another team reads as not-found.
        boolean accessible =
                policyStore.get(policyId).filter(policyAccessGuard::canAccess).isPresent();
        if (accessible && policyStore.delete(policyId)) {
            // Cancel any now-orphaned folder watch promptly rather than leaving the WatchKey open
            // until the next reconcile sweep.
            policyTriggerManager.notifyPoliciesChanged();
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.notFound().build();
    }

    @PostMapping(value = "/{policyId}/run", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Run a stored policy",
            description =
                    "Runs the stored policy's pipeline on the supplied files (primary documents"
                            + " under 'fileInput', supporting files under 'assets[i].key' /"
                            + " 'assets[i].file'). Runs regardless of the policy's enabled flag,"
                            + " which only gates automatic triggering. Returns a run id.")
    public ResponseEntity<JobResponse<Void>> runStoredPolicy(
            @PathVariable String policyId, @Valid @ModelAttribute PolicyRunFiles files)
            throws IOException {
        Policy policy =
                policyStore
                        .get(policyId)
                        .filter(policyAccessGuard::canAccess)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "No policy: " + policyId));
        PolicyInputs inputs = toInputs(files);
        String runId = policyRunner.runWith(policy, inputs, PolicyProgressListener.NOOP).runId();
        return ResponseEntity.accepted().body(new JobResponse<>(true, runId, null));
    }

    @PostMapping("/{policyId}/trigger")
    @Operation(
            summary = "Run a stored policy against its sources",
            description =
                    "Pulls the policy's configured sources and runs the pipeline now, regardless of"
                            + " the enabled flag (which only gates automatic triggering). Returns"
                            + " the ids of the runs started; poll the run-status endpoint for each."
                            + " Empty when the sources yielded no work to do.")
    public ResponseEntity<List<String>> trigger(@PathVariable String policyId) {
        Policy policy =
                policyStore
                        .get(policyId)
                        .filter(policyAccessGuard::canAccess)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "No policy: " + policyId));
        return ResponseEntity.accepted().body(policyRunner.run(policy));
    }

    private static void requireRunnable(PipelineDefinition definition) {
        if (definition.steps().isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Pipeline definition has no steps");
        }
    }

    /**
     * Turn the typed run files into engine {@link PolicyInputs}: the primary documents plus the
     * named supporting-file store, where each asset's {@code key} is the name a step references
     * from its {@code fileParameters}. Assets sharing a key are grouped, so a key may carry several
     * files.
     */
    private PolicyInputs toInputs(PolicyRunFiles files) throws IOException {
        List<Resource> primary = toResources(files.getFileInput());
        Map<String, List<Resource>> supportingFiles = new LinkedHashMap<>();
        for (NamedAsset asset : files.getAssets()) {
            Resource resource = toResource(asset.getFile());
            if (resource != null) {
                supportingFiles
                        .computeIfAbsent(asset.getKey(), key -> new ArrayList<>())
                        .add(resource);
            }
        }
        return new PolicyInputs(primary, supportingFiles);
    }

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
            // Client gone or emitter closed. The run continues and outputs stay downloadable via
            // the job endpoints.
            log.debug("Dropping policy SSE event '{}': {}", name, e.getMessage());
        }
    }

    private List<Resource> toResources(List<MultipartFile> files) throws IOException {
        List<Resource> resources = new ArrayList<>();
        if (files == null) {
            return resources;
        }
        for (MultipartFile file : files) {
            Resource resource = toResource(file);
            if (resource != null) {
                resources.add(resource);
            }
        }
        return resources;
    }

    /** Spool a single uploaded file to a managed temp file, preserving its name; null if empty. */
    private Resource toResource(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            return null;
        }
        TempFile tempFile = tempFileManager.createManagedTempFile("policy-run");
        file.transferTo(tempFile.getPath());
        final String originalName = Filenames.toSimpleFileName(file.getOriginalFilename());
        return new FileSystemResource(tempFile.getFile()) {
            @Override
            public String getFilename() {
                return originalName;
            }
        };
    }
}
