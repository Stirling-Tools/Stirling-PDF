package stirling.software.proprietary.failure;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

/**
 * Read and triage recorded failures for the caller's team. Note the absence of a team parameter:
 * the team comes from the authenticated principal, never the request.
 *
 * <p>Reviewing failures is a leader-level capability, gated the same way policy editing is: see
 * {@link #requireFailureReviewAllowed()}.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/file-run-events")
@Hidden
@RequiredArgsConstructor
@Tag(name = "File run events", description = "Recorded policy and pipeline failures")
public class FileRunEventController {

    /** Cap on one page, so a client cannot ask for the whole table. */
    private static final int MAX_LIMIT = 200;

    private static final int DEFAULT_LIMIT = 50;

    private final FileRunEventService service;
    private final PolicyManagementAuthority policyManagementAuthority;
    private final ApplicationProperties applicationProperties;

    @GetMapping
    @Operation(
            summary = "List recorded failures",
            description =
                    "Failures recorded for the caller's team, newest first. Each row carries its"
                            + " available actions already resolved.")
    public FileRunEventsResponse list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String kindId,
            @RequestParam(required = false) Integer limit) {
        requireFailureReviewAllowed();
        FileRunEventStatus parsedStatus = parseStatus(status);
        int cappedLimit = Math.min(limit == null ? DEFAULT_LIMIT : Math.max(1, limit), MAX_LIMIT);

        List<FileRunEventView> events =
                service.list(parsedStatus, cappedLimit).stream()
                        // Filtered here rather than in SQL: the page is already team- and
                        // status-scoped, so this avoids a second query shape.
                        .filter(event -> kindId == null || kindId.equals(event.kind().getId()))
                        .map(event -> FileRunEventView.of(event, service.availableActions(event)))
                        .toList();
        return new FileRunEventsResponse(events);
    }

    @PostMapping("/{eventId}/actions/{actionId}")
    @Operation(
            summary = "Apply an action to a recorded failure",
            description =
                    "Rejected with 400 if the failure's kind does not declare the action, so an"
                            + " action that makes no sense for a given failure cannot be applied.")
    public FileRunEventView act(
            @PathVariable String eventId,
            @PathVariable String actionId,
            @RequestBody(required = false) ActionRequest request) {
        requireFailureReviewAllowed();
        Map<String, String> inputs = request == null ? Map.of() : request.safeInputs();
        try {
            FileRunEvent updated = service.dispatch(eventId, actionId, inputs);
            return FileRunEventView.of(updated, service.availableActions(updated));
        } catch (FailureActionException e) {
            throw new ResponseStatusException(statusFor(e.getReason()), e.getMessage(), e);
        }
    }

    @GetMapping("/kinds")
    @Operation(
            summary = "List known failure kinds",
            description =
                    "The failure registry. Lets a client describe kinds it was not built with, and"
                            + " doubles as the probe for whether failure tracking exists at all.")
    public List<FailureKindView> kinds() {
        requireFailureReviewAllowed();
        return Arrays.stream(FailureKind.values()).map(FailureKindView::of).toList();
    }

    /**
     * Triage is for a team leader (SaaS) or admin (self-hosted), mirroring {@code
     * PolicyController.requirePolicyEditingAllowed()} rather than inventing a second notion of who
     * manages a team's automation: a member can trigger runs, a leader reviews them.
     *
     * <p>Login disabled means a single-user deployment with no roles to tell apart, the same
     * carve-out the policy endpoints make. Team scoping is separate, and lives in the service.
     */
    private void requireFailureReviewAllowed() {
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            return;
        }
        if (!policyManagementAuthority.canEditPolicies()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Recorded failures may only be reviewed by a team leader");
        }
    }

    /**
     * A closed row is a conflict rather than a bad request: the request was well-formed and would
     * have been valid a moment earlier.
     */
    private static HttpStatus statusFor(FailureActionException.Reason reason) {
        return switch (reason) {
            case EVENT_NOT_FOUND -> HttpStatus.NOT_FOUND;
            case ACTION_NOT_RECOGNISED, ACTION_NOT_DECLARED -> HttpStatus.BAD_REQUEST;
            case ALREADY_CLOSED -> HttpStatus.CONFLICT;
        };
    }

    private static FileRunEventStatus parseStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        for (FileRunEventStatus candidate : FileRunEventStatus.values()) {
            if (candidate.name().equalsIgnoreCase(status)) {
                return candidate;
            }
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown status: " + status);
    }

    /** Wrapped rather than a bare array so pagination can be added without breaking clients. */
    public record FileRunEventsResponse(List<FileRunEventView> events) {}

    /** Inputs an action declared it needs. Empty for both actions that exist today. */
    public record ActionRequest(Map<String, String> inputs) {

        Map<String, String> safeInputs() {
            return inputs == null ? Map.of() : inputs;
        }
    }
}
