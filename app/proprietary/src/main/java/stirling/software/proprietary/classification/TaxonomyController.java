package stirling.software.proprietary.classification;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.classification.model.ClassificationTaxonomy;
import stirling.software.proprietary.classification.model.TaxonomyValidator;
import stirling.software.proprietary.classification.store.TaxonomyStore;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

/**
 * Read/write the caller's team classification taxonomy — the vocabulary the document classifier
 * runs against. Team-scoped exactly like policies: every user reads their own team's taxonomy, and
 * only a user who may edit policies (a team leader on SaaS, the global admin self-hosted; see
 * {@link PolicyManagementAuthority}) may change it. Editing is gated only when login is enabled;
 * single-user deployments trust the local operator. A team with no stored taxonomy reads as {@code
 * 204} and the classifier falls back to the engine's built-in default.
 */
@RestController
@RequestMapping("/api/v1/classification/taxonomy")
@Hidden
@RequiredArgsConstructor
@Tag(name = "Classification", description = "Team-scoped document-classification taxonomy")
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class TaxonomyController {

    private final TaxonomyStore taxonomyStore;
    private final PolicyManagementAuthority policyManagementAuthority;
    private final ApplicationProperties applicationProperties;
    private final UserServiceInterface userService;

    @GetMapping
    @Operation(
            summary = "Get the team's classification taxonomy",
            description =
                    "Returns the caller's team taxonomy, or 204 when the team has none (the"
                            + " classifier then uses the built-in default).")
    public ResponseEntity<ClassificationTaxonomy> getTaxonomy() {
        return taxonomyStore
                .findByTeam(currentTeamId())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Save the team's classification taxonomy",
            description =
                    "Validates and stores the taxonomy for the caller's team, shared by everyone on"
                            + " the team. Requires the policy-editor role for the team.")
    public ResponseEntity<ClassificationTaxonomy> saveTaxonomy(
            @RequestBody ClassificationTaxonomy taxonomy) {
        requireEditingAllowed();
        try {
            TaxonomyValidator.validate(taxonomy);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        ClassificationTaxonomy saved =
                taxonomyStore.save(currentTeamId(), taxonomy, currentUsername());
        return ResponseEntity.ok(saved);
    }

    @DeleteMapping
    @Operation(
            summary = "Reset the team's classification taxonomy",
            description =
                    "Removes the team's stored taxonomy so the classifier falls back to the built-in"
                            + " default. Requires the policy-editor role for the team.")
    public ResponseEntity<Void> resetTaxonomy() {
        requireEditingAllowed();
        taxonomyStore.deleteByTeam(currentTeamId());
        return ResponseEntity.noContent().build();
    }

    /**
     * Editing the taxonomy requires the editor role for the caller's team — the same gate policies
     * use (team leader on SaaS, global admin self-hosted). Single-user deployments (login disabled)
     * have no such role, so they trust the local operator.
     */
    private void requireEditingAllowed() {
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            return;
        }
        if (!policyManagementAuthority.canEditPolicies()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "The classification taxonomy may only be changed by a team leader");
        }
    }

    private Long currentTeamId() {
        return policyManagementAuthority.currentUserTeamId();
    }

    private String currentUsername() {
        return userService == null ? null : userService.getCurrentUsername();
    }
}
