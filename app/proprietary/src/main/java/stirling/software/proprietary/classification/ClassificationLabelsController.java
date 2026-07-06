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
import stirling.software.proprietary.classification.model.ClassificationLabels;
import stirling.software.proprietary.classification.model.LabelsValidator;
import stirling.software.proprietary.classification.store.ClassificationLabelStore;
import stirling.software.proprietary.classification.store.TeamLabelsEntity;
import stirling.software.proprietary.classification.store.UserLabelsEntity;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

/**
 * Read/write the classification label sets — the flat vocabulary the document classifier runs
 * against. Two scopes: the team set is shared and team-scoped exactly like policies (every user
 * reads their own team's labels, and only a user who may edit policies — a team leader on SaaS, the
 * global admin self-hosted; see {@link PolicyManagementAuthority} — may change it; editing is gated
 * only when login is enabled, since single-user deployments trust the local operator), while {@code
 * /mine} is the calling user's personal additive set, editable by any authenticated user. A scope
 * with no stored labels reads as {@code 204}; when neither scope has any the classifier falls back
 * to the engine's built-in default.
 */
@RestController
@RequestMapping("/api/v1/classification/labels")
@Hidden
@RequiredArgsConstructor
@Tag(name = "Classification", description = "Team- and user-scoped document-classification labels")
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class ClassificationLabelsController {

    private final ClassificationLabelStore labelStore;
    private final PolicyManagementAuthority policyManagementAuthority;
    private final ApplicationProperties applicationProperties;
    private final UserServiceInterface userService;

    @GetMapping
    @Operation(
            summary = "Get the team's classification labels",
            description =
                    "Returns the caller's team label set, or 204 when the team has none (the"
                            + " classifier then uses the built-in default).")
    public ResponseEntity<ClassificationLabels> getTeamLabels() {
        return labelStore
                .findByTeam(currentTeamId())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Save the team's classification labels",
            description =
                    "Validates and stores the label set for the caller's team, shared by everyone"
                            + " on the team. Requires the policy-editor role for the team.")
    public ResponseEntity<ClassificationLabels> saveTeamLabels(
            @RequestBody ClassificationLabels labels) {
        requireEditingAllowed();
        validate(labels);
        ClassificationLabels saved = labelStore.save(currentTeamId(), labels, currentUsername());
        return ResponseEntity.ok(saved);
    }

    @DeleteMapping
    @Operation(
            summary = "Reset the team's classification labels",
            description =
                    "Removes the team's stored label set so the classifier falls back to the"
                            + " built-in default. Requires the policy-editor role for the team.")
    public ResponseEntity<Void> resetTeamLabels() {
        requireEditingAllowed();
        labelStore.deleteByTeam(currentTeamId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/mine")
    @Operation(
            summary = "Get the caller's personal classification labels",
            description =
                    "Returns the calling user's own additive label set, or 204 when they have"
                            + " none.")
    public ResponseEntity<ClassificationLabels> getMyLabels() {
        return labelStore
                .findByUser(currentUserId())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping(value = "/mine", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Save the caller's personal classification labels",
            description =
                    "Validates and stores the calling user's own additive label set, applied on top"
                            + " of the team set for their uploads only.")
    public ResponseEntity<ClassificationLabels> saveMyLabels(
            @RequestBody ClassificationLabels labels) {
        validate(labels);
        return ResponseEntity.ok(labelStore.saveForUser(currentUserId(), labels));
    }

    private static void validate(ClassificationLabels labels) {
        try {
            LabelsValidator.validate(labels);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }

    /**
     * Editing the team labels requires the editor role for the caller's team — the same gate
     * policies use (team leader on SaaS, global admin self-hosted). Single-user deployments (login
     * disabled) have no such role, so they trust the local operator.
     */
    private void requireEditingAllowed() {
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            return;
        }
        if (!policyManagementAuthority.canEditPolicies()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "The team classification labels may only be changed by a team leader");
        }
    }

    /**
     * The caller's team key. With login disabled the single operator owns the {@link
     * TeamLabelsEntity#NO_TEAM} sentinel row; with login enabled a caller with no resolvable team
     * is an error rather than being dropped into the shared sentinel bucket (which would let
     * unteamed users read and overwrite each other's "team" labels).
     */
    private Long currentTeamId() {
        Long teamId = policyManagementAuthority.currentUserTeamId();
        if (teamId != null) {
            return teamId;
        }
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            return TeamLabelsEntity.NO_TEAM;
        }
        throw new ResponseStatusException(
                HttpStatus.UNAUTHORIZED, "Could not resolve the current user's team");
    }

    /**
     * The key for the caller's personal label set. With login disabled the single local operator
     * owns the {@link UserLabelsEntity#NO_USER} sentinel row (mirroring the unteamed team set);
     * with login enabled an unresolvable user is an error rather than a shared bucket.
     */
    private long currentUserId() {
        Long userId = policyManagementAuthority.currentUserId();
        if (userId != null) {
            return userId;
        }
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            return UserLabelsEntity.NO_USER;
        }
        throw new ResponseStatusException(
                HttpStatus.UNAUTHORIZED, "Could not resolve the current user");
    }

    private String currentUsername() {
        return userService == null ? null : userService.getCurrentUsername();
    }
}
