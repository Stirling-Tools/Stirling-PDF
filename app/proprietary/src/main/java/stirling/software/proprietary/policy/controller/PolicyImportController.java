package stirling.software.proprietary.policy.controller;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.engine.PolicyValidator;
import stirling.software.proprietary.policy.model.EditorConfig;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Installs a pipeline store manifest as a new, paused policy in the caller's team.
 *
 * <p>The store hands the portal a manifest (tool chain and settings only); the portal posts it here
 * so the copy is created by the backend that will run it, under the same authorisation and step
 * validation as a hand-built policy. The result is an ordinary policy with no inputs, no
 * destinations and {@code enabled = false}: the builder's existing blockers are what walks the
 * installer through choosing a source and destination and supplying any cleared secrets. Only
 * {@code storeId} is kept as a link back to the listing; nothing else about the copy's origin is
 * tracked.
 */
@RestController
@RequestMapping("/api/v1/policies")
@RequiredArgsConstructor
@Hidden
public class PolicyImportController {

    private static final int MAX_NAME_LENGTH = 80;
    private static final int MAX_STEPS = 50;

    private final PolicyStore policyStore;
    private final PolicyValidator policyValidator;
    private final PolicyAccessGuard policyAccessGuard;
    private final PolicyManagementAuthority policyManagementAuthority;

    /** A store manifest reduced to what a policy needs: the chain, plus the link back. */
    public record PolicyImportRequest(
            String name, String icon, String storeId, List<PipelineStep> steps) {}

    @PostMapping(value = "/import", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Install a pipeline store manifest as a paused policy",
            description =
                    "Creates a paused policy from a store manifest's steps, with no inputs or"
                            + " destinations. Name collisions get a numeric suffix. Returns the"
                            + " stored policy.")
    public ResponseEntity<Policy> importPipeline(@RequestBody PolicyImportRequest request) {
        if (!policyManagementAuthority.canEditPolicies()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Policies may only be created by a team leader");
        }
        String name = request.name() == null ? "" : request.name().trim();
        if (name.isEmpty() || name.length() > MAX_NAME_LENGTH) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "A pipeline name is required");
        }
        if (request.steps() == null || request.steps().isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "A pipeline needs at least one step");
        }
        if (request.steps().size() > MAX_STEPS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Too many steps");
        }
        // A manifest never carries file bindings: supporting files are stripped before publishing.
        // Dropping any that arrive keeps an import from binding another team's stored asset by id.
        List<PipelineStep> steps =
                request.steps().stream()
                        .map(
                                step ->
                                        new PipelineStep(
                                                step.operation(),
                                                step.parameters() == null
                                                        ? Map.of()
                                                        : step.parameters(),
                                                Map.of()))
                        .toList();
        for (PipelineStep step : steps) {
            if (step.operation() == null || step.operation().isBlank()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Every step needs an operation");
            }
        }
        try {
            policyValidator.validateSteps(steps);
            policyValidator.validateChain(steps);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }

        Long teamId = policyAccessGuard.teamForNewPolicy();
        Policy policy =
                new Policy(
                        null,
                        uniqueName(name, teamId),
                        policyAccessGuard.ownerForNewPolicy(),
                        false,
                        false,
                        request.icon(),
                        List.of(),
                        steps,
                        OutputSpec.inline(),
                        List.of(),
                        teamId,
                        EditorConfig.disabled(),
                        request.storeId());
        return ResponseEntity.status(HttpStatus.CREATED).body(policyStore.save(policy));
    }

    /**
     * A second copy of the same listing gets " (2)", then " (3)" and so on, so two copies never
     * read as one pipeline in the list.
     */
    private String uniqueName(String base, Long teamId) {
        Set<String> taken =
                (teamId == null ? policyStore.all() : policyStore.findByTeam(teamId))
                        .stream().map(Policy::name).collect(Collectors.toSet());
        if (!taken.contains(base)) {
            return base;
        }
        for (int n = 2; n < 1000; n++) {
            String candidate = base + " (" + n + ")";
            if (!taken.contains(candidate)) {
                return candidate;
            }
        }
        return base + " (" + UUID.randomUUID().toString().substring(0, 8) + ")";
    }
}
