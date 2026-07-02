package stirling.software.proprietary.policy.source;

import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.policy.trigger.PolicyTriggerManager;

/**
 * CRUD for persisted, reusable input connections plus the Sources overview for the admin portal. A
 * source is configured once here and referenced by id from any number of policies; the overview
 * reports how many reference each one. Editing follows the same team-leader rule as policies, and
 * everything is scoped to the caller's team.
 */
@RestController
@RequestMapping("/api/v1/sources")
@Hidden
@RequiredArgsConstructor
@Tag(name = "Sources", description = "Reusable policy input connections")
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class SourceController {

    private final SourceStore sourceStore;
    private final SourceAccessGuard sourceAccessGuard;
    private final SourceOverviewService overviewService;
    private final PolicyStore policyStore;
    private final PolicyAccessGuard policyAccessGuard;
    private final PolicyManagementAuthority policyManagementAuthority;
    private final PolicyTriggerManager policyTriggerManager;
    private final ApplicationProperties applicationProperties;
    private final List<InputSource> inputSources;

    @GetMapping
    @Operation(
            summary = "Sources overview",
            description =
                    "Returns the KPI strip plus one row per source the caller's team owns, each with"
                            + " how many policies reference it and which.")
    public SourcesResponse list() {
        return overviewService.overview();
    }

    @GetMapping("/{sourceId}")
    @Operation(summary = "Get a source by id")
    public ResponseEntity<Source> get(@PathVariable String sourceId) {
        return sourceStore
                .get(sourceId)
                .filter(sourceAccessGuard::canAccess)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/{sourceId}/document-counts")
    @Operation(
            summary = "Daily document counts for a source",
            description =
                    "The trailing 30-day per-day document series (oldest first) for the source's"
                            + " sparkline.")
    public ResponseEntity<List<Long>> documentCounts(@PathVariable String sourceId) {
        return sourceStore
                .get(sourceId)
                .filter(sourceAccessGuard::canAccess)
                .map(source -> ResponseEntity.ok(overviewService.dailySeries(source.id())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Create or update a source",
            description =
                    "Stores an input connection (type + config). A blank id is assigned; owner and"
                            + " team are stamped server-side. The config is validated against the"
                            + " matching source type.")
    public ResponseEntity<Source> save(@RequestBody Source source) {
        requireSourceEditingAllowed();
        Source owned = resolveOwnership(source);
        try {
            validateConfig(owned);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        Source saved = sourceStore.save(owned);
        // An edited folder source can change which directory needs watching, so re-sync trigger
        // registrations now instead of waiting for the next reconcile.
        policyTriggerManager.notifyPoliciesChanged();
        return ResponseEntity.ok(saved);
    }

    @DeleteMapping("/{sourceId}")
    @Operation(
            summary = "Delete a source",
            description =
                    "Removes a source that no policy references. A source still in use returns 409"
                            + " so the connection can't be pulled out from under a live policy.")
    public ResponseEntity<Void> delete(@PathVariable String sourceId) {
        requireSourceEditingAllowed();
        Source source = sourceStore.get(sourceId).filter(sourceAccessGuard::canAccess).orElse(null);
        if (source == null) {
            return ResponseEntity.notFound().build();
        }
        List<String> referencing = referencingPolicyNames(sourceId);
        if (!referencing.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Source is referenced by "
                            + referencing.size()
                            + " policy(ies): "
                            + String.join(", ", referencing));
        }
        sourceStore.delete(sourceId);
        return ResponseEntity.noContent().build();
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
                    throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No source: " + id);
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

    /** Validate the config against the bean that handles the source's type, as the engine will. */
    private void validateConfig(Source source) {
        InputSpec spec = source.toInputSpec();
        inputSources.stream()
                .filter(inputSource -> inputSource.supports(spec))
                .findFirst()
                .orElseThrow(
                        () -> new IllegalArgumentException("unknown source type: " + source.type()))
                .validate(spec);
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
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Sources may only be created or modified by a team leader");
        }
    }

    /** Names of the caller's visible policies that reference the given source. */
    private List<String> referencingPolicyNames(String sourceId) {
        return policyAccessGuard.visibleFrom(policyStore).stream()
                .filter(policy -> policy.sourceIds().contains(sourceId))
                .map(Policy::name)
                .toList();
    }
}
