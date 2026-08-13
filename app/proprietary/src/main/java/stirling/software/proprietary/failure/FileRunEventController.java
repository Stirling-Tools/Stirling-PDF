package stirling.software.proprietary.failure;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
            // Spring's converter 400s on a value outside the enum, so no hand-rolled parse.
            @RequestParam(required = false) FileRunEventStatus status,
            @RequestParam(required = false) String kindId,
            @RequestParam(required = false) Integer limit) {
        requireFailureReviewAllowed();
        int cappedLimit = Math.min(limit == null ? DEFAULT_LIMIT : Math.max(1, limit), MAX_LIMIT);

        List<FileRunEventView> events =
                // The kind filter is part of the query, before the limit is applied: filtering an
                // already-limited page could return nothing while matching rows exist.
                service.list(status, kindId, cappedLimit).stream()
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

    @PostMapping("/reports")
    @Operation(
            summary = "Report a failure hit in the editor",
            description =
                    "For failures the server never sees, because the editor calls tools directly."
                            + " Open to any authenticated user, unlike the read and triage endpoints:"
                            + " whoever's work failed can say so, and a leader reviews it. Rejected"
                            + " with 400 if it names more files than one report may carry.")
    public ResponseEntity<Void> report(@RequestBody EditorFailureReport report) {
        if (report == null || !report.hasOperation()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "operation is required to report a failure");
        }
        // Refused whole rather than trimmed, and refused before the first write, so an oversized
        // report leaves no rows at all. Trimming would hand a reviewer part of a set with nothing
        // saying the rest existed, which is what the cap inside the service used to do. The limit
        // is stated in the message because the editor reports in the background: a client author
        // reading a log is the only person who will ever see this.
        if (report.namesTooManyFiles()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "a report may name at most "
                            + EditorFailureReport.MAX_FILE_IDS
                            + " files, and this one named "
                            + report.fileIds().size());
        }
        service.report(report);
        // No body: the editor reports and moves on, and has nothing to do with the row.
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/removed-files")
    @Operation(
            summary = "Close the incidents about files deleted from the editor",
            description =
                    "Deleting the document leaves nothing to act on, so its incidents drop out of"
                            + " the queue while the rows stay for audit. Open to any authenticated"
                            + " user, and applies only to their own editor rows.")
    public ResponseEntity<Void> filesRemoved(@RequestBody(required = false) RemovedFiles request) {
        service.forgetFiles(request == null ? List.of() : request.safeFileIds());
        // No body: the editor is telling the server, not asking it anything.
        return ResponseEntity.noContent().build();
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

    /** Wrapped rather than a bare array so pagination can be added without breaking clients. */
    public record FileRunEventsResponse(List<FileRunEventView> events) {}

    /**
     * Files gone from the caller's editor. Opaque ids only, as everywhere else on this API.
     *
     * <p>Deliberately uncapped where a report is capped, because this creates nothing: it closes
     * rows the caller already owns, so however long the list is, it can only ever touch incidents
     * that already exist. Refusing an oversized one would also be the harmful direction here, since
     * the editor says this once and never retries: those incidents would sit in the queue asking
     * for attention about files that no longer exist.
     */
    public record RemovedFiles(List<String> fileIds) {

        List<String> safeFileIds() {
            return fileIds == null ? List.of() : fileIds;
        }
    }

    /** Inputs an action declared it needs. Empty for both actions that exist today. */
    public record ActionRequest(Map<String, String> inputs) {

        Map<String, String> safeInputs() {
            return inputs == null ? Map.of() : inputs;
        }
    }
}
