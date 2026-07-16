package stirling.software.proprietary.policy.output;

import java.util.List;
import java.util.Map;
import java.util.Objects;

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
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.util.SecretMasker;

/**
 * CRUD for persisted, reusable output destinations plus the Outputs overview for the admin portal.
 * An output is configured once here and referenced by id from any number of policies; the overview
 * reports how many reference each one. Editing follows the same team-leader rule as policies, and
 * everything is scoped to the caller's team. Mirrors {@link
 * stirling.software.proprietary.policy.source.SourceController}.
 */
@RestController
@RequestMapping("/api/v1/outputs")
@Hidden
@RequiredArgsConstructor
@Tag(name = "Outputs", description = "Reusable policy output destinations")
public class OutputController {

    private final OutputStore outputStore;
    private final OutputAccessGuard outputAccessGuard;
    private final OutputOverviewService overviewService;
    private final PolicyStore policyStore;
    private final PolicyAccessGuard policyAccessGuard;
    private final PolicyManagementAuthority policyManagementAuthority;
    private final ApplicationProperties applicationProperties;
    private final List<PolicyOutputSink> outputSinks;

    @GetMapping
    @Operation(
            summary = "Outputs overview",
            description =
                    "Returns the KPI strip plus one row per output the caller's team owns, each with"
                            + " how many policies reference it and which.")
    public OutputsResponse list() {
        return overviewService.overview();
    }

    @GetMapping("/{outputId}")
    @Operation(
            summary = "Get an output by id",
            description =
                    "Secret-bearing options are returned as a redaction sentinel, never their"
                            + " stored values; an edit that sends the sentinel back keeps them.")
    public ResponseEntity<Output> get(@PathVariable String outputId) {
        return outputStore
                .get(outputId)
                .filter(outputAccessGuard::canAccess)
                .map(OutputController::withMaskedSecrets)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Create or update an output",
            description =
                    "Stores an output destination (type + config). A blank id is assigned; owner and"
                            + " team are stamped server-side. The config is validated against the"
                            + " matching output type. Inline (return-to-caller) is not a persistable"
                            + " destination and is rejected.")
    public ResponseEntity<Output> save(@RequestBody Output output) {
        requireOutputEditingAllowed();
        requireDestinationType(output.type());
        Output owned = withStoredSecrets(resolveOwnership(output));
        try {
            validateConfig(owned);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        Output saved = outputStore.save(owned);
        return ResponseEntity.ok(withMaskedSecrets(saved));
    }

    @DeleteMapping("/{outputId}")
    @Operation(
            summary = "Delete an output",
            description =
                    "Removes an output that no policy references. An output still in use returns 409"
                            + " so the destination can't be pulled out from under a live policy.")
    public ResponseEntity<Void> delete(@PathVariable String outputId) {
        requireOutputEditingAllowed();
        Output output = outputStore.get(outputId).filter(outputAccessGuard::canAccess).orElse(null);
        if (output == null) {
            return ResponseEntity.notFound().build();
        }
        List<String> referencing = referencingPolicyNames(outputId);
        if (!referencing.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Output is referenced by "
                            + referencing.size()
                            + " policy(ies): "
                            + String.join(", ", referencing));
        }
        outputStore.delete(outputId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Stamp owner + team server-side. Create stamps the current user and their team; update
     * preserves the existing owner and team after verifying the output belongs to the caller's
     * team, so the client can neither forge ownership on create nor reach across teams on update
     * (an output in another team reads as not-found).
     */
    private Output resolveOwnership(Output incoming) {
        String id = incoming.id();
        if (id != null && !id.isBlank()) {
            Output existing = outputStore.get(id).orElse(null);
            if (existing != null) {
                if (!outputAccessGuard.canAccess(existing)) {
                    throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No output: " + id);
                }
                return withOwnerAndTeam(incoming, existing.owner(), existing.teamId());
            }
        }
        return withOwnerAndTeam(
                incoming,
                outputAccessGuard.ownerForNewOutput(),
                outputAccessGuard.teamForNewOutput());
    }

    private static Output withOwnerAndTeam(Output output, String owner, Long teamId) {
        return new Output(
                output.id(),
                output.name(),
                output.type(),
                output.options(),
                output.enabled(),
                owner,
                teamId);
    }

    private static Output withOptions(Output output, Map<String, Object> options) {
        return new Output(
                output.id(),
                output.name(),
                output.type(),
                options,
                output.enabled(),
                output.owner(),
                output.teamId());
    }

    /** Secrets never leave the server: reads return the redaction sentinel in their place. */
    private static Output withMaskedSecrets(Output output) {
        return withOptions(output, SecretMasker.mask(output.options()));
    }

    /**
     * An edit that round-trips a masked read sends secrets back as the sentinel; restore them from
     * the stored output so saving without re-typing keeps them (validation then runs against the
     * real values).
     */
    private Output withStoredSecrets(Output incoming) {
        if (incoming.id() == null || incoming.id().isBlank()) {
            return incoming;
        }
        return outputStore
                .get(incoming.id())
                .map(
                        existing ->
                                withOptions(
                                        incoming,
                                        SecretMasker.restoreRedacted(
                                                incoming.options(), existing.options())))
                .orElse(incoming);
    }

    /** Validate the config against the bean that handles the output's type, as the engine will. */
    private void validateConfig(Output output) {
        OutputSpec spec = output.toOutputSpec();
        outputSinks.stream()
                .filter(sink -> sink.supports(spec))
                .findFirst()
                .orElseThrow(
                        () -> new IllegalArgumentException("unknown output type: " + output.type()))
                .validate(spec);
    }

    /**
     * Editing outputs requires the editor role for the caller's team (a team leader on SaaS), the
     * same rule as policies. Single-user deployments (login disabled) trust the local operator.
     */
    private void requireOutputEditingAllowed() {
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            return;
        }
        if (!policyManagementAuthority.canEditPolicies()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Outputs may only be created or modified by a team leader");
        }
    }

    /**
     * A persisted output is a real destination (folder, S3). Inline "return to caller" has no
     * config to store and only makes sense for one-off runs, so it is not a saveable output.
     */
    private static void requireDestinationType(String type) {
        if (type == null || type.isBlank() || "inline".equals(type)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "An output must be a stored destination (e.g. folder or S3), not inline");
        }
    }

    /** Names of the caller's visible policies that reference the given output. */
    private List<String> referencingPolicyNames(String outputId) {
        return policyAccessGuard.visibleFrom(policyStore).stream()
                .filter(policy -> Objects.equals(policy.outputId(), outputId))
                .map(Policy::name)
                .toList();
    }
}
