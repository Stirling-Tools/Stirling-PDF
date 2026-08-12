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

/**
 * Read and triage recorded failures. Note the absence of a team parameter: the team comes from the
 * authenticated principal, never the request.
 *
 * <p>Every endpoint is open to any authenticated user and scoped in the service instead: a leader
 * reads and closes the whole team's failures, everyone else their own. Nothing here decides who may
 * do what, so the two cannot drift apart.
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

    @GetMapping
    @Operation(
            summary = "List recorded failures",
            description =
                    "Failures the caller may see, newest first: their team's for a leader, their own"
                            + " for everyone else. Each row carries its available actions already"
                            + " resolved.")
    public FileRunEventsResponse list(
            // Spring's converter 400s on a value outside the enum, so no hand-rolled parse.
            @RequestParam(required = false) FileRunEventStatus status,
            @RequestParam(required = false) String kindId,
            @RequestParam(required = false) Integer limit) {
        // No role gate: the service scopes the read instead, so a member gets their own failures
        // and a leader the team's.
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
        // No role gate: the service decides, which lets someone close their own failure while
        // still keeping a colleague's out of reach.
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
                            + " Whoever's work failed can say so, and reads it back scoped to"
                            + " themselves.")
    public ResponseEntity<Void> report(@RequestBody EditorFailureReport report) {
        if (report == null || !report.hasOperation()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "operation is required to report a failure");
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
                            + " the queue while the rows stay for audit. Applies only to the"
                            + " caller's own editor rows, however senior they are.")
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
        // The registry is copy and metadata, not anyone's data, and a member needs it to render the
        // failures they can already see.
        return Arrays.stream(FailureKind.values()).map(FailureKindView::of).toList();
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

    /** Files gone from the caller's editor. Opaque ids only, as everywhere else on this API. */
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
