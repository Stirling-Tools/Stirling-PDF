package stirling.software.proprietary.policy.controller;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.jboss.resteasy.reactive.PartType;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.RestStreamElementType;
import org.jboss.resteasy.reactive.server.core.multipart.DefaultFileUpload;
import org.jboss.resteasy.reactive.server.multipart.FormValue;
import org.jboss.resteasy.reactive.server.multipart.MultipartFormDataInput;

import io.github.pixee.security.Filenames;
import io.quarkus.arc.All;
import io.quarkus.arc.profile.IfBuildProfile;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
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

import stirling.software.common.cluster.JobStore;
import stirling.software.common.cluster.JobStoreEntry;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.io.FileSystemResource;
import stirling.software.common.model.io.Resource;
import stirling.software.common.model.job.JobResponse;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.model.tool.ToolDiagnostic;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.service.ToolChainValidator;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.proprietary.audit.AuditContext;
import stirling.software.proprietary.policy.asset.PolicyAssetCleaner;
import stirling.software.proprietary.policy.asset.PolicyAssetResolver;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.engine.PolicyRunHandle;
import stirling.software.proprietary.policy.engine.PolicyRunRegistry;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.engine.PolicyValidator;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.PipelineValidation;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.PolicyRunStatus;
import stirling.software.proprietary.policy.model.PolicyRunView;
import stirling.software.proprietary.policy.overview.PoliciesOverviewResponse;
import stirling.software.proprietary.policy.overview.PolicyOverviewService;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.policy.source.EditorSource;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceAccessGuard;
import stirling.software.proprietary.policy.source.SourceDocCounter;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.policy.trigger.PolicyTrigger;
import stirling.software.proprietary.policy.trigger.PolicyTriggerManager;
import stirling.software.proprietary.policy.trigger.TriggerInfo;
import stirling.software.proprietary.util.SecretMasker;

/**
 * Policy CRUD plus pipeline runs (stored or ad-hoc). Runs are async: returns a run id, poll {@code
 * GET /run/{runId}} for status, download outputs via {@code GET /api/v1/general/files/{fileId}}.
 */
@Slf4j
@ApplicationScoped
@IfBuildProfile("saas")
@Path("/api/v1/policies")
@Hidden
@Tag(name = "Policies", description = "Run tool pipelines on the backend")
public class PolicyController {

    /** Indexed asset part names on the wire: {@code assets[i].key} / {@code assets[i].file}. */
    private static final Pattern ASSET_PART =
            Pattern.compile("assets\\[(\\d{1,9})]\\.(?:key|file)");

    private final PolicyRunner policyRunner;
    private final PolicyRunRegistry runRegistry;
    private final PolicyStore policyStore;
    private final SourceStore sourceStore;
    private final SourceAccessGuard sourceAccessGuard;
    private final SourceDocCounter docCounter;
    private final PolicyValidator policyValidator;
    private final PolicyAccessGuard policyAccessGuard;
    private final PolicyManagementAuthority policyManagementAuthority;
    private final PolicyTriggerManager policyTriggerManager;
    private final PolicyOverviewService policyOverviewService;
    private final PolicyAssetCleaner assetCleaner;
    private final PolicyAssetResolver assetResolver;
    private final ProcessedLedger processedLedger;
    private final List<PolicyTrigger> policyTriggers;
    private final ApplicationProperties applicationProperties;
    private final TempFileManager tempFileManager;
    private final JobOwnershipService jobOwnershipService;
    // Shared job store: lets the run endpoints see runs that executed on other nodes.
    private final JobStore jobStore;
    private final Instance<HttpServletRequest> currentRequest;

    // Explicit constructor instead of Lombok so the List<PolicyTrigger> injection point can carry
    // @All, which is how CDI collects every bean of a type the way Spring's List autowiring did.
    @Inject
    public PolicyController(
            PolicyRunner policyRunner,
            PolicyRunRegistry runRegistry,
            PolicyStore policyStore,
            SourceStore sourceStore,
            SourceAccessGuard sourceAccessGuard,
            SourceDocCounter docCounter,
            PolicyValidator policyValidator,
            PolicyAccessGuard policyAccessGuard,
            PolicyManagementAuthority policyManagementAuthority,
            PolicyTriggerManager policyTriggerManager,
            PolicyOverviewService policyOverviewService,
            PolicyAssetCleaner assetCleaner,
            PolicyAssetResolver assetResolver,
            ProcessedLedger processedLedger,
            @All List<PolicyTrigger> policyTriggers,
            ApplicationProperties applicationProperties,
            TempFileManager tempFileManager,
            JobOwnershipService jobOwnershipService,
            JobStore jobStore,
            Instance<HttpServletRequest> currentRequest) {
        this.policyRunner = policyRunner;
        this.runRegistry = runRegistry;
        this.policyStore = policyStore;
        this.sourceStore = sourceStore;
        this.sourceAccessGuard = sourceAccessGuard;
        this.docCounter = docCounter;
        this.policyValidator = policyValidator;
        this.policyAccessGuard = policyAccessGuard;
        this.policyManagementAuthority = policyManagementAuthority;
        this.policyTriggerManager = policyTriggerManager;
        this.policyOverviewService = policyOverviewService;
        this.assetCleaner = assetCleaner;
        this.assetResolver = assetResolver;
        this.processedLedger = processedLedger;
        this.policyTriggers = policyTriggers;
        this.applicationProperties = applicationProperties;
        this.tempFileManager = tempFileManager;
        this.jobOwnershipService = jobOwnershipService;
        this.jobStore = jobStore;
        this.currentRequest = currentRequest;
    }

    @POST
    @Path("/run")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Run a tool pipeline",
            description =
                    "Accepts the documents to process (multipart field 'fileInput'), any supporting"
                            + " files (under 'assets[i].key' / 'assets[i].file'), and the pipeline"
                            + " definition as an application/json part named 'json'. Runs the steps"
                            + " in order asynchronously and returns a run id. Poll the run status"
                            + " endpoint and download outputs via /api/v1/general/files/{id}.")
    public Response run(
            @RestForm("json") @PartType(MediaType.APPLICATION_JSON) PipelineDefinition definition,
            @RestForm("policyId") String policyId,
            MultipartFormDataInput parts)
            throws IOException {
        stampPolicyAudit(definition);
        requireRunnable(definition);
        validateAdHocRun(definition);
        PolicyInputs inputs = resolveStoredAssets(policyId, toInputs(toRunFiles(parts)));
        PolicyRunHandle handle =
                policyRunner.runAdHoc(definition, inputs, PolicyProgressListener.NOOP);
        recordEditorDocs(inputs);
        return Response.accepted(new JobResponse<>(true, handle.runId(), null)).build();
    }

    @POST
    @Path("/run/stream")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @RestStreamElementType(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Run a tool pipeline with live progress",
            description =
                    "Same as /run, but returns Server-Sent Events: a 'step' event as each step"
                            + " starts and completes, then a terminal 'completed', 'failed',"
                            + " 'cancelled', or 'waiting' event carrying the final run view.")
    public void runStream(
            @RestForm("json") @PartType(MediaType.APPLICATION_JSON) PipelineDefinition definition,
            @RestForm("policyId") String policyId,
            MultipartFormDataInput parts,
            @Context Sse sse,
            @Context SseEventSink sink)
            throws IOException {
        stampPolicyAudit(definition);
        requireRunnable(definition);
        validateAdHocRun(definition);
        PolicyInputs inputs = resolveStoredAssets(policyId, toInputs(toRunFiles(parts)));

        // JAX-RS has no per-sink deadline (Spring's SseEmitter timeout) or error callback; a stream
        // whose run never finishes is bounded by the container's HTTP idle timeout instead.
        PolicyRunHandle handle =
                policyRunner.runAdHoc(definition, inputs, streamListener(sse, sink));
        recordEditorDocs(inputs);
        // whenComplete runs on the worker thread after the run finishes, so the terminal event
        // never races the step events.
        handle.completion()
                .whenComplete(
                        (run, throwable) -> {
                            if (throwable != null) {
                                sendEvent(
                                        sse,
                                        sink,
                                        "failed",
                                        Map.of("message", throwable.getMessage()));
                            } else {
                                sendEvent(sse, sink, terminalEventName(run), PolicyRunView.of(run));
                            }
                            if (!sink.isClosed()) {
                                sink.close();
                            }
                        });
    }

    @GET
    @Path("/run/{runId}")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Get pipeline run status",
            description = "Returns the current status, step cursor, and output files of a run.")
    public Response status(@PathParam("runId") String runId) {
        PolicyRun run = runRegistry.get(runId);
        if (run != null) {
            return Response.ok(PolicyRunView.of(run)).build();
        }
        // Not local: read the run's shared projection so any node can serve its status.
        if (ownedByCurrentUser(runId)) {
            Optional<JobStoreEntry> entry = jobStore.get(runId);
            if (entry.isPresent()
                    && entry.get().resultMeta() != null
                    && entry.get().resultMeta().containsKey("policyId")) {
                return Response.ok(PolicyRunView.ofEntry(entry.get())).build();
            }
        }
        return Response.status(Response.Status.NOT_FOUND).build();
    }

    @GET
    @Path("/runs")
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
        // Local runs first (they carry live step state); keyed by runId to dedupe shared entries.
        Map<String, PolicyRunView> byRunId = new LinkedHashMap<>();
        runRegistry.all().stream()
                .filter(run -> run.getPolicyId() != null)
                .filter(run -> ownedByCurrentUser(run.getRunId()))
                .forEach(run -> byRunId.put(run.getRunId(), PolicyRunView.of(run)));
        // Then runs from other nodes, read from the shared job store.
        for (JobStoreEntry entry : jobStore.all()) {
            if (byRunId.containsKey(entry.jobId())) {
                continue;
            }
            Map<String, String> meta = entry.resultMeta();
            if (meta == null || !meta.containsKey("policyId")) {
                continue; // ad-hoc job, not a stored-policy run
            }
            if (ownedByCurrentUser(entry.jobId())) {
                byRunId.put(entry.jobId(), PolicyRunView.ofEntry(entry));
            }
        }
        return List.copyOf(byRunId.values());
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
    @Path("/validate")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Check whether a chain of steps can run",
            description =
                    "Reports which steps cannot accept what the step before them produces, without"
                            + " running anything or storing anything. Saving already rejects a"
                            + " chain whose steps cannot run; this answers the same question up"
                            + " front, and also returns the warnings and fan-out notes that saving"
                            + " does not.")
    public PipelineValidation.Response validateChain(PipelineValidation.Request request) {
        List<ToolDiagnostic> diagnostics =
                policyValidator.diagnoseChain(request.steps(), request.sourceFormat());
        return new PipelineValidation.Response(
                !ToolChainValidator.hasErrors(diagnostics), diagnostics);
    }

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
        Policy owned = withStoredOutputSecrets(resolveOwnership(policy));
        requireAccessibleSources(owned);
        requireAccessibleOutput(owned);
        try {
            policyValidator.validate(owned);
        } catch (IllegalArgumentException e) {
            throw new WebApplicationException(e.getMessage(), Response.Status.BAD_REQUEST);
        }
        // Snapshot the previous version before saving so supporting files this edit dropped can
        // be cleaned up once nothing references them.
        Policy previous =
                owned.id() == null || owned.id().isBlank()
                        ? null
                        : policyStore.get(owned.id()).orElse(null);
        Policy saved = policyStore.save(owned);
        assetCleaner.cleanupAfterSave(previous, saved);
        // Re-sync trigger registrations now so a new/changed folder-watch policy starts being
        // watched immediately instead of after the next reconcile sweep.
        policyTriggerManager.notifyPoliciesChanged();
        return Response.ok(withMaskedOutputSecrets(saved)).build();
    }

    @PUT
    @Path("/order")
    @Consumes(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Set the team's policy run order",
            description =
                    "Persists the team-wide order policies run in, from the given ordered list of"
                            + " policy ids (position → order). The per-trigger order shown in the UI"
                            + " is this one sequence filtered by trigger. Team-leader/admin only;"
                            + " ids outside the caller's team are ignored.")
    public Response reorderPolicies(List<String> orderedPolicyIds) {
        requirePolicyEditingAllowed();
        policyStore.reorder(policyAccessGuard.teamForNewPolicy(), orderedPolicyIds);
        return Response.noContent().build();
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
                throw new WebApplicationException(
                        "Unknown or inaccessible source: " + sourceId, Response.Status.BAD_REQUEST);
            }
        }
    }

    /**
     * A policy's output destination is a {@link Source} used as a write target: it must resolve to
     * a source in the caller's team, so a client can neither reference a non-existent location nor
     * reach across teams to write to another team's. The editor is virtual and has no writable
     * location, so it can't be a destination. The config is then validated on this (request) thread
     * so an S3 destination's connection is authorization-checked against the caller - the async
     * delivery worker has no principal. A policy with no reference (inline / editor / one-off) has
     * nothing to check.
     */
    private void requireAccessibleOutput(Policy policy) {
        for (String outputId : policy.outputIds()) {
            Source destination =
                    sourceStore
                            .get(outputId)
                            .filter(sourceAccessGuard::canAccess)
                            .orElseThrow(
                                    () ->
                                            new WebApplicationException(
                                                    "Unknown or inaccessible output source: "
                                                            + outputId,
                                                    Response.Status.BAD_REQUEST));
            if (EditorSource.TYPE.equals(destination.type())) {
                throw new WebApplicationException(
                        "The editor can't be used as an output destination",
                        Response.Status.BAD_REQUEST);
            }
            try {
                policyValidator.validateOutput(destination.toOutputSpec());
            } catch (IllegalArgumentException e) {
                throw new WebApplicationException(e.getMessage(), Response.Status.BAD_REQUEST);
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
                policy.inputs(),
                policy.steps(),
                policy.output(),
                policy.outputIds(),
                teamId);
    }

    /** Output secrets never leave the server: reads return the redaction sentinel instead. */
    private static Policy withMaskedOutputSecrets(Policy policy) {
        return withOutput(
                policy,
                new OutputSpec(
                        policy.output().type(), SecretMasker.mask(policy.output().options())));
    }

    /**
     * An edit that round-trips a masked read sends output secrets back as the sentinel; restore
     * them from the stored policy so saving without re-typing keeps them (validation then runs
     * against the real values).
     */
    private Policy withStoredOutputSecrets(Policy incoming) {
        if (incoming.id() == null || incoming.id().isBlank()) {
            return incoming;
        }
        return policyStore
                .get(incoming.id())
                .map(
                        existing ->
                                withOutput(
                                        incoming,
                                        new OutputSpec(
                                                incoming.output().type(),
                                                SecretMasker.restoreRedacted(
                                                        incoming.output().options(),
                                                        existing.output().options()))))
                .orElse(incoming);
    }

    private static Policy withOutput(Policy policy, OutputSpec output) {
        return policy.withOutput(output);
    }

    /**
     * Creating, editing, pausing/resuming, and deleting policies requires the editor role for the
     * caller's team — a team leader on SaaS (see {@link PolicyManagementAuthority}); the global
     * admin gets no say on SaaS. Team scoping (which team's policies) is enforced separately by
     * {@link PolicyAccessGuard}. Every mutation routes through {@link #savePolicy} (pause/resume
     * re-save with a flipped {@code enabled} flag) or {@link #deletePolicy}, so gating those two
     * covers them all; runs over the caller's own files ({@code /{id}/run}) stay open to the team,
     * while source sweeps are gated by {@link #requirePolicySweepAllowed}. Single-user deployments
     * (login disabled) have no such role, so they trust the local operator. The path allowlist for
     * folder sources/outputs is enforced separately by {@link PolicyValidator} at validation time.
     */
    private void requirePolicyEditingAllowed() {
        if (!policyEditingAllowed()) {
            throw new WebApplicationException(
                    "Policies may only be created or modified by a team leader",
                    Response.Status.FORBIDDEN);
        }
    }

    /**
     * Sweeping a policy's configured sources requires the same role as managing policies: the sweep
     * operates on the team's configured sources using the server's stored connection credentials,
     * which makes it a policy-management capability rather than ordinary use, and team scoping on
     * its own does not express that. Deliberately narrower than it looks: it gates only the sweep,
     * not {@link #runStoredPolicy}, because running a policy over documents the caller supplied is
     * ordinary editor enforcement that every member performs on upload and export.
     */
    private void requirePolicySweepAllowed() {
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            return;
        }
        if (!policyManagementAuthority.canTriggerPolicies()) {
            throw new WebApplicationException(
                    "Not permitted to run this policy against its configured sources",
                    Response.Status.FORBIDDEN);
        }
    }

    /**
     * Whether the caller may create/modify policies (a team leader, or any operator when login is
     * off).
     */
    private boolean policyEditingAllowed() {
        return !applicationProperties.getSecurity().isEnableLogin()
                || policyManagementAuthority.canEditPolicies();
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "List policies",
            description =
                    "Lists the policies belonging to the caller's team. Secret-bearing output"
                            + " options are returned as a redaction sentinel, never their stored"
                            + " values.")
    public List<Policy> listPolicies() {
        return policyAccessGuard.visibleFrom(policyStore).stream()
                .map(PolicyController::withMaskedOutputSecrets)
                .toList();
    }

    @GET
    @Path("/overview")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Pipelines overview",
            description =
                    "Returns the KPI strip plus one row per policy the caller's team owns, each with"
                            + " its referenced sources resolved to names, its pipeline steps, and a"
                            + " trigger/output summary. Backs the portal's all-pipelines surface.")
    public PoliciesOverviewResponse overview() {
        return policyOverviewService.overview();
    }

    @GET
    @Path("/triggers")
    @Produces(MediaType.APPLICATION_JSON)
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

    @GET
    @Path("/{policyId}")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Get a policy by id",
            description =
                    "Secret-bearing output options are returned as a redaction sentinel, never"
                            + " their stored values; an edit that sends the sentinel back keeps"
                            + " them.")
    public Response getPolicy(@PathParam("policyId") String policyId) {
        return policyStore
                .get(policyId)
                .filter(policyAccessGuard::canAccess)
                .map(PolicyController::withMaskedOutputSecrets)
                .map(masked -> Response.ok(masked).build())
                .orElseGet(() -> Response.status(Response.Status.NOT_FOUND).build());
    }

    @DELETE
    @Path("/{policyId}")
    @Operation(summary = "Delete a policy by id")
    public Response deletePolicy(@PathParam("policyId") String policyId) {
        requirePolicyEditingAllowed();
        // Scope to the caller's team: a policy in another team reads as not-found.
        Policy policy = policyStore.get(policyId).filter(policyAccessGuard::canAccess).orElse(null);
        if (policy != null && policyStore.delete(policyId)) {
            processedLedger.clearPolicy(policyId);
            assetCleaner.cleanupAfterDelete(policy);
            // Cancel any now-orphaned folder watch promptly rather than leaving the WatchKey open
            // until the next reconcile sweep.
            policyTriggerManager.notifyPoliciesChanged();
            return Response.noContent().build();
        }
        return Response.status(Response.Status.NOT_FOUND).build();
    }

    @DELETE
    @Path("/{policyId}/processed-history")
    @Operation(
            summary = "Clear a policy's processed-file history",
            description =
                    "Forgets which source files this policy has already processed, so its next"
                            + " sweep reprocesses everything currently in its sources. Does not"
                            + " touch the files themselves.")
    public Response clearProcessedHistory(@PathParam("policyId") String policyId) {
        requirePolicyEditingAllowed();
        // Scope to the caller's team: a policy in another team reads as not-found.
        boolean accessible =
                policyStore.get(policyId).filter(policyAccessGuard::canAccess).isPresent();
        if (!accessible) {
            return Response.status(Response.Status.NOT_FOUND).build();
        }
        processedLedger.clearPolicy(policyId);
        return Response.noContent().build();
    }

    @POST
    @Path("/{policyId}/run")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Run a stored policy",
            description =
                    "Runs the stored policy's pipeline on the supplied files (primary documents"
                            + " under 'fileInput', supporting files under 'assets[i].key' /"
                            + " 'assets[i].file' - only for bindings the policy does not already"
                            + " store). Runs regardless of the policy's enabled flag, which only"
                            + " gates automatic triggering. Returns a run id.")
    public Response runStoredPolicy(
            @PathParam("policyId") String policyId, MultipartFormDataInput parts)
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
        stampPolicyAudit(policy.toDefinition());
        PolicyInputs inputs = toInputs(toRunFiles(parts));
        String runId = policyRunner.runWith(policy, inputs, PolicyProgressListener.NOOP).runId();
        return Response.accepted(new JobResponse<>(true, runId, null)).build();
    }

    @POST
    @Path("/{policyId}/trigger")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Run a stored policy against its sources",
            description =
                    "Pulls the policy's configured sources and runs the pipeline now, regardless of"
                            + " the enabled flag (which only gates automatic triggering). Returns"
                            + " the ids of the runs started (poll the run-status endpoint for each)"
                            + " plus what the sweep skipped - already-processed, parked-by-failure,"
                            + " and in-flight counts - so an empty result explains itself. Requires"
                            + " the policy-management role.")
    public Response trigger(@PathParam("policyId") String policyId) {
        requirePolicySweepAllowed();
        Policy policy =
                policyStore
                        .get(policyId)
                        .filter(policyAccessGuard::canAccess)
                        .orElseThrow(
                                () ->
                                        new WebApplicationException(
                                                "No policy: " + policyId,
                                                Response.Status.NOT_FOUND));
        return Response.accepted(policyRunner.run(policy)).build();
    }

    private static void requireRunnable(PipelineDefinition definition) {
        // An absent 'json' part binds as null, where Spring's @RequestPart rejected the request.
        if (definition == null) {
            throw new WebApplicationException(
                    "Required part 'json' is not present", Response.Status.BAD_REQUEST);
        }
        if (definition.steps().isEmpty()) {
            throw new WebApplicationException(
                    "Pipeline definition has no steps", Response.Status.BAD_REQUEST);
        }
    }

    /**
     * Stamp this run's policy name and step endpoints onto the current request so the audit aspect
     * can label the event as the policy it ran (rather than the generic {@code /run} endpoint) and
     * record which tools it executed. No-op outside a web request.
     */
    private void stampPolicyAudit(PipelineDefinition definition) {
        HttpServletRequest request = currentServletRequest();
        if (definition == null || request == null) {
            return;
        }
        if (definition.name() != null && !definition.name().isBlank()) {
            request.setAttribute(AuditContext.REQ_ATTR_POLICY_NAME, definition.name());
        }
        List<String> steps =
                definition.steps().stream()
                        .map(PipelineStep::operation)
                        .filter(op -> op != null && !op.isBlank())
                        .toList();
        if (!steps.isEmpty()) {
            request.setAttribute(AuditContext.REQ_ATTR_POLICY_STEPS, steps);
        }
    }

    /**
     * The request the audit aspect reads these attributes back off, or null when none is active -
     * resolving the proxy throws off a servlet request, which is the old {@code
     * RequestContextHolder} null case.
     */
    private HttpServletRequest currentServletRequest() {
        try {
            if (currentRequest.isUnsatisfied()) {
                return null;
            }
            HttpServletRequest request = currentRequest.get();
            request.getRequestURI();
            return request;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * Authorization-check an ad-hoc run's steps and output while the caller's principal is present
     * (this request thread). The worker thread that later runs and delivers carries no security
     * context, so a connection-access check would be skipped there; without this gate a caller
     * could reference another tenant's connection by id and write to it, or make the server call it
     * with its stored credentials (confused deputy). Stored policies are covered by save-time
     * {@link PolicyValidator#validate} instead.
     */
    private void validateAdHocRun(PipelineDefinition definition) {
        try {
            // Steps get the same treatment as the output, and for the same reason: an integration
            // step dereferences its connection by id on a principal-less worker thread, so this
            // request thread is the only place that reference can be checked against the caller.
            policyValidator.validateSteps(definition.steps());
            // Every destination is checked; an ad-hoc run with no destinations validates nothing.
            for (OutputSpec output : definition.outputs()) {
                policyValidator.validateOutput(output);
            }
        } catch (IllegalArgumentException e) {
            throw new WebApplicationException(e.getMessage(), Response.Status.BAD_REQUEST);
        }
    }

    /**
     * Ad-hoc runs (AI / one-off pipelines) are still editor activity, so their supplied documents
     * feed the same virtual editor source as stored editor policies, counted against the caller's
     * team. A run with no primary documents (generator pipeline) records nothing.
     */
    private void recordEditorDocs(PolicyInputs inputs) {
        docCounter.record(
                EditorSource.counterKey(sourceAccessGuard.currentTeamId()),
                inputs.primary().size());
    }

    /**
     * Resolve a test run's stored {@code asset:<id>} bindings from the saved policy the builder is
     * editing, so their bytes need not be re-uploaded. Scoped to that policy (the resolver loads
     * only the assets it references, in its own team) and gated to policy editors - the same
     * authority that can read asset bytes - so a member can't rebind a policy's stored asset into
     * an ad-hoc step to read it back. A blank id (an unsaved pipeline has no stored bindings) or an
     * inaccessible policy leaves the run-supplied inputs untouched.
     */
    private PolicyInputs resolveStoredAssets(String policyId, PolicyInputs inputs) {
        if (policyId == null || policyId.isBlank() || !policyEditingAllowed()) {
            return inputs;
        }
        return policyStore
                .get(policyId)
                .filter(policyAccessGuard::canAccess)
                .map(policy -> assetResolver.resolve(policy, inputs))
                .orElse(inputs);
    }

    /**
     * Bind the run's multipart parts by hand: RESTEasy Reactive cannot map Spring's indexed {@code
     * assets[i].key} / {@code assets[i].file} fields onto a list of POJOs carrying files.
     */
    private static PolicyRunFiles toRunFiles(MultipartFormDataInput input) {
        PolicyRunFiles files = new PolicyRunFiles();
        if (input == null || input.getValues() == null) {
            return files;
        }
        Map<String, Collection<FormValue>> parts = input.getValues();
        files.setFileInput(filesUnder("fileInput", parts));
        files.setAssets(assetsFrom(parts));
        return files;
    }

    /** Every file part sent under the given field name, in the order the client sent them. */
    private static List<MultipartFile> filesUnder(
            String partName, Map<String, Collection<FormValue>> parts) {
        List<MultipartFile> uploads = new ArrayList<>();
        for (FormValue value : parts.getOrDefault(partName, List.of())) {
            if (value.isFileItem()) {
                uploads.add(FileUploadMultipartFile.of(new DefaultFileUpload(partName, value)));
            }
        }
        return uploads;
    }

    /**
     * The keyed supporting assets. Every index up to the highest one sent must carry both a key and
     * a file, which is what the bound POJO's {@code @NotBlank} / {@code @NotNull} rejected.
     */
    private static List<NamedAsset> assetsFrom(Map<String, Collection<FormValue>> parts) {
        int highestIndex = -1;
        for (String partName : parts.keySet()) {
            Matcher matcher = ASSET_PART.matcher(partName);
            if (matcher.matches()) {
                highestIndex = Math.max(highestIndex, Integer.parseInt(matcher.group(1)));
            }
        }
        List<NamedAsset> assets = new ArrayList<>();
        for (int index = 0; index <= highestIndex; index++) {
            NamedAsset asset = new NamedAsset();
            asset.setKey(requireText("assets[" + index + "].key", parts));
            asset.setFile(requireFile("assets[" + index + "].file", parts));
            assets.add(asset);
        }
        return assets;
    }

    private static String requireText(String partName, Map<String, Collection<FormValue>> parts) {
        for (FormValue value : parts.getOrDefault(partName, List.of())) {
            if (!value.isFileItem() && value.getValue() != null && !value.getValue().isBlank()) {
                return value.getValue();
            }
        }
        throw new WebApplicationException(
                "Missing multipart field: " + partName, Response.Status.BAD_REQUEST);
    }

    private static MultipartFile requireFile(
            String partName, Map<String, Collection<FormValue>> parts) {
        List<MultipartFile> uploads = filesUnder(partName, parts);
        if (uploads.isEmpty()) {
            throw new WebApplicationException(
                    "Missing multipart file: " + partName, Response.Status.BAD_REQUEST);
        }
        return uploads.get(0);
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

    private PolicyProgressListener streamListener(Sse sse, SseEventSink sink) {
        return new PolicyProgressListener() {
            @Override
            public void onStepStart(int stepIndex, int stepCount, String operation) {
                sendEvent(sse, sink, "step", stepEvent("started", stepIndex, stepCount, operation));
            }

            @Override
            public void onStepComplete(int stepIndex, int stepCount, String operation) {
                sendEvent(
                        sse, sink, "step", stepEvent("completed", stepIndex, stepCount, operation));
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

    private void sendEvent(Sse sse, SseEventSink sink, String name, Object data) {
        OutboundSseEvent event =
                sse.newEventBuilder()
                        .name(name)
                        .mediaType(MediaType.APPLICATION_JSON_TYPE)
                        .data(data)
                        .build();
        try {
            // Join so a failed delivery surfaces here, the way SseEmitter#send threw outright.
            sink.send(event).toCompletableFuture().join();
        } catch (RuntimeException e) {
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
