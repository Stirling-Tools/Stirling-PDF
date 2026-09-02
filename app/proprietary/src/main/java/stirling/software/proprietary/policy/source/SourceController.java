package stirling.software.proprietary.policy.source;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import io.quarkus.arc.All;
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
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.config.FolderAccessDeniedException;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.policy.trigger.PolicyTriggerManager;
import stirling.software.proprietary.util.SecretMasker;

/**
 * CRUD for persisted, reusable input connections plus the Sources overview for the admin portal. A
 * source is configured once here and referenced by id from any number of policies; the overview
 * reports how many reference each one. Editing follows the same team-leader rule as policies, and
 * everything is scoped to the caller's team.
 */
@ApplicationScoped
@IfBuildProfile("saas")
@Path("/api/v1/sources")
@Hidden
@Tag(name = "Sources", description = "Reusable policy input connections")
public class SourceController {

    /**
     * Machine-readable marker on the error body when a folder source is rejected for pointing
     * outside the allowed roots. The admin portal keys off this to offer a link straight to the
     * Folder Access settings rather than only showing the message.
     */
    public static final String FOLDER_ACCESS_DENIED_CODE = "folderAccessDenied";

    private static final String WEBHOOK_TYPE = "webhook";

    private final SourceStore sourceStore;
    private final SourceAccessGuard sourceAccessGuard;
    private final SourceOverviewService overviewService;
    private final PolicyStore policyStore;
    private final PolicyAccessGuard policyAccessGuard;
    private final PolicyManagementAuthority policyManagementAuthority;
    private final PolicyTriggerManager policyTriggerManager;
    private final ApplicationProperties applicationProperties;
    private final List<InputSource> inputSources;

    // Explicit constructor instead of Lombok so the List<InputSource> injection point can carry
    // @All, which is how CDI collects every bean of a type the way Spring's List autowiring did.
    @Inject
    public SourceController(
            SourceStore sourceStore,
            SourceAccessGuard sourceAccessGuard,
            SourceOverviewService overviewService,
            PolicyStore policyStore,
            PolicyAccessGuard policyAccessGuard,
            PolicyManagementAuthority policyManagementAuthority,
            PolicyTriggerManager policyTriggerManager,
            ApplicationProperties applicationProperties,
            @All List<InputSource> inputSources) {
        this.sourceStore = sourceStore;
        this.sourceAccessGuard = sourceAccessGuard;
        this.overviewService = overviewService;
        this.policyStore = policyStore;
        this.policyAccessGuard = policyAccessGuard;
        this.policyManagementAuthority = policyManagementAuthority;
        this.policyTriggerManager = policyTriggerManager;
        this.applicationProperties = applicationProperties;
        this.inputSources = inputSources;
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Sources overview",
            description =
                    "Returns the KPI strip plus one row per source the caller's team owns, each with"
                            + " how many policies reference it and which.")
    public SourcesResponse list() {
        return overviewService.overview();
    }

    @GET
    @Path("/{sourceId}")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Get a source by id",
            description =
                    "Secret-bearing options are returned as a redaction sentinel, never their"
                            + " stored values; an edit that sends the sentinel back keeps them.")
    public Response get(@PathParam("sourceId") String sourceId) {
        return sourceStore
                .get(sourceId)
                .filter(sourceAccessGuard::canAccess)
                .map(SourceController::withMaskedSecrets)
                .map(masked -> Response.ok(masked).build())
                .orElseGet(() -> Response.status(Response.Status.NOT_FOUND).build());
    }

    @GET
    @Path("/{sourceId}/document-counts")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Daily document counts for a source",
            description =
                    "The trailing 30-day per-day document series (oldest first) for the source's"
                            + " sparkline.")
    public Response documentCounts(@PathParam("sourceId") String sourceId) {
        // The editor is virtual: its series is tracked per team, not against a persisted source.
        if (EditorSource.ID.equals(sourceId)) {
            return Response.ok(overviewService.editorDailySeries()).build();
        }
        return sourceStore
                .get(sourceId)
                .filter(sourceAccessGuard::canAccess)
                .map(source -> Response.ok(overviewService.dailySeries(source.id())).build())
                .orElseGet(() -> Response.status(Response.Status.NOT_FOUND).build());
    }

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Create or update a source",
            description =
                    "Stores an input connection (type + config). A blank id is assigned; owner and"
                            + " team are stamped server-side. The config is validated against the"
                            + " matching source type.")
    public Response save(Source source) {
        requireSourceEditingAllowed();
        requireNotEditor(source.id(), source.type());
        boolean isCreate = source.id() == null || source.id().isBlank();
        Source owned = withPreparedOptions(withStoredSecrets(resolveOwnership(source)), isCreate);
        try {
            validateConfig(owned);
        } catch (FolderAccessDeniedException e) {
            // Surfaced with a machine-readable code by FolderAccessDeniedExceptionMapper so the
            // portal can link to Folder Access settings; don't flatten it into a plain 400 here.
            throw e;
        } catch (IllegalArgumentException e) {
            throw new WebApplicationException(e.getMessage(), Response.Status.BAD_REQUEST);
        }
        Source saved = sourceStore.save(owned);
        // An edited folder source can change which directory needs watching, so re-sync trigger
        // registrations now instead of waiting for the next reconcile.
        policyTriggerManager.notifyPoliciesChanged();
        return Response.ok(revealOnCreate(saved, isCreate)).build();
    }

    @DELETE
    @Path("/{sourceId}")
    @Operation(
            summary = "Delete a source",
            description =
                    "Removes a source that no policy references. A source still in use returns 409"
                            + " so the connection can't be pulled out from under a live policy.")
    public Response delete(@PathParam("sourceId") String sourceId) {
        requireSourceEditingAllowed();
        requireNotEditor(sourceId, null);
        Source source = sourceStore.get(sourceId).filter(sourceAccessGuard::canAccess).orElse(null);
        if (source == null) {
            return Response.status(Response.Status.NOT_FOUND).build();
        }
        List<String> referencing = referencingPolicyNames(sourceId);
        if (!referencing.isEmpty()) {
            throw new WebApplicationException(
                    "Source is referenced by "
                            + referencing.size()
                            + " policy(ies): "
                            + String.join(", ", referencing),
                    Response.Status.CONFLICT);
        }
        sourceStore.delete(sourceId);
        return Response.noContent().build();
    }

    /**
     * Stamp owner + team server-side. Create stamps the current user and their team; update
     * preserves the existing owner and team after verifying the source belongs to the caller's
     * team, so the client can neither forge ownership on create nor reach across teams on update (a
     * source in another team reads as not-found).
     */
    private Source resolveOwnership(Source incoming) {
        String id = incoming.id();
        if (id != null && !id.isBlank()) {
            Source existing = sourceStore.get(id).orElse(null);
            if (existing != null) {
                if (!sourceAccessGuard.canAccess(existing)) {
                    throw new WebApplicationException(
                            "No source: " + id, Response.Status.NOT_FOUND);
                }
                return withOwnerAndTeam(incoming, existing.owner(), existing.teamId());
            }
        }
        return withOwnerAndTeam(
                incoming,
                sourceAccessGuard.ownerForNewSource(),
                sourceAccessGuard.teamForNewSource());
    }

    private static Source withOwnerAndTeam(Source source, String owner, Long teamId) {
        return new Source(
                source.id(),
                source.name(),
                source.type(),
                source.options(),
                source.enabled(),
                owner,
                teamId);
    }

    private static Source withOptions(Source source, Map<String, Object> options) {
        return new Source(
                source.id(),
                source.name(),
                source.type(),
                options,
                source.enabled(),
                source.owner(),
                source.teamId());
    }

    /** Secrets never leave the server: reads return the redaction sentinel in their place. */
    private static Source withMaskedSecrets(Source source) {
        return withOptions(source, SecretMasker.mask(source.options()));
    }

    /**
     * An edit that round-trips a masked read sends secrets back as the sentinel; restore them from
     * the stored source so saving without re-typing keeps them (validation then runs against the
     * real values).
     */
    private Source withStoredSecrets(Source incoming) {
        if (incoming.id() == null || incoming.id().isBlank()) {
            return incoming;
        }
        return sourceStore
                .get(incoming.id())
                .map(
                        existing ->
                                withOptions(
                                        incoming,
                                        SecretMasker.restoreRedacted(
                                                incoming.options(), existing.options())))
                .orElse(incoming);
    }

    /** Validate the config against the bean that handles the source's type, as the engine will. */
    private void validateConfig(Source source) {
        InputSpec spec = source.toInputSpec();
        inputSourceFor(spec)
                .orElseThrow(
                        () -> new IllegalArgumentException("unknown source type: " + source.type()))
                .validate(spec);
    }

    private Source withPreparedOptions(Source source, boolean isCreate) {
        InputSpec spec = source.toInputSpec();
        InputSource input = inputSourceFor(spec).orElse(null);
        if (input == null) {
            return source;
        }
        Map<String, Object> prepared = input.prepareOptionsForSave(source.options(), isCreate);
        return prepared == null ? source : withOptions(source, prepared);
    }

    private static Source revealOnCreate(Source saved, boolean isCreate) {
        if (isCreate && WEBHOOK_TYPE.equals(saved.type())) {
            return saved;
        }
        return withMaskedSecrets(saved);
    }

    private Optional<InputSource> inputSourceFor(InputSpec spec) {
        return inputSources.stream().filter(input -> input.supports(spec)).findFirst();
    }

    /**
     * Editing sources requires the editor role for the caller's team (a team leader on SaaS), the
     * same rule as policies. Single-user deployments (login disabled) trust the local operator.
     */
    private void requireSourceEditingAllowed() {
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            return;
        }
        if (!policyManagementAuthority.canEditPolicies()) {
            throw new WebApplicationException(
                    "Sources may only be created or modified by a team leader",
                    Response.Status.FORBIDDEN);
        }
    }

    /**
     * The editor is a built-in, virtual source: it is always present and cannot be created, edited,
     * or deleted like a persisted connection. Reject any attempt to touch it by id or type.
     */
    private static void requireNotEditor(String id, String type) {
        if (EditorSource.ID.equals(id) || EditorSource.TYPE.equals(type)) {
            throw new WebApplicationException(
                    "The editor is a built-in source and cannot be created, edited, or deleted",
                    Response.Status.BAD_REQUEST);
        }
    }

    /**
     * Names of the caller's visible policies that reference the given source - as an input ({@code
     * sourceIds}) or as their output destination ({@code outputId}), so a location in use either
     * way is protected from deletion.
     */
    private List<String> referencingPolicyNames(String sourceId) {
        return policyAccessGuard.visibleFrom(policyStore).stream()
                .filter(
                        policy ->
                                policy.sourceIds().contains(sourceId)
                                        || policy.outputIds().contains(sourceId))
                .map(Policy::name)
                .toList();
    }
}
