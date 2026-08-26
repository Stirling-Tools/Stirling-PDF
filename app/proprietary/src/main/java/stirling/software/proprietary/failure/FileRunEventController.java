package stirling.software.proprietary.failure;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

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
@ApplicationScoped
@Path("/api/v1/file-run-events")
@Hidden
@RequiredArgsConstructor
@Tag(name = "File run events", description = "Recorded policy and pipeline failures")
public class FileRunEventController {

    /** Cap on one page, so a client cannot ask for the whole table. */
    private static final int MAX_LIMIT = 200;

    private static final int DEFAULT_LIMIT = 50;

    private final FileRunEventService service;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "List recorded failures",
            description =
                    "Failures the caller may see, newest first: their team's for a leader, their own"
                            + " for everyone else. Each row carries its available actions already"
                            + " resolved.")
    public FileRunEventsResponse list(
            // RESTEasy's converter 400s on a value outside the enum, so no hand-rolled parse.
            @QueryParam("status") FileRunEventStatus status,
            @QueryParam("kindId") String kindId,
            @QueryParam("limit") Integer limit) {
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

    @POST
    @Path("/{eventId}/actions/{actionId}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Apply an action to a recorded failure",
            description =
                    "Rejected with 400 if the failure's kind does not declare the action, or if the"
                            + " action is one the client runs rather than the server, so neither an"
                            + " action that makes no sense for a given failure nor one the server"
                            + " cannot perform can be applied.")
    public FileRunEventView act(
            @PathParam("eventId") String eventId,
            @PathParam("actionId") String actionId,
            ActionRequest request) {
        // No role gate: the service decides, which lets someone close their own failure while
        // still keeping a colleague's out of reach.
        Map<String, String> inputs = request == null ? Map.of() : request.safeInputs();
        try {
            FileRunEvent updated = service.dispatch(eventId, actionId, inputs);
            return FileRunEventView.of(updated, service.availableActions(updated));
        } catch (FailureActionException e) {
            throw new WebApplicationException(e.getMessage(), e, statusFor(e.getReason()));
        }
    }

    @POST
    @Path("/reports")
    @Consumes(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Report a failure hit in the editor",
            description =
                    "For failures the server never sees, because the editor calls tools directly."
                            + " Open to any authenticated user: whoever's work failed can say so, and"
                            + " reads it back scoped to themselves. Rejected with 400 if it names"
                            + " more files than one report may carry.")
    public Response report(EditorFailureReport report) {
        if (report == null || !report.hasOperation()) {
            throw new WebApplicationException(
                    "operation is required to report a failure", Response.Status.BAD_REQUEST);
        }
        // Refused whole rather than trimmed, and refused before the first write, so an oversized
        // report leaves no rows at all. Trimming would hand a reviewer part of a set with nothing
        // saying the rest existed, which is what the cap inside the service used to do. The limit
        // is stated in the message because the editor reports in the background: a client author
        // reading a log is the only person who will ever see this.
        if (report.namesTooManyFiles()) {
            throw new WebApplicationException(
                    "a report may name at most "
                            + EditorFailureReport.MAX_FILE_IDS
                            + " files, and this one named "
                            + report.fileIds().size(),
                    Response.Status.BAD_REQUEST);
        }
        service.report(report);
        // No body: the editor reports and moves on, and has nothing to do with the row.
        return Response.noContent().build();
    }

    @POST
    @Path("/removed-files")
    @Consumes(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Close the incidents about files deleted from the editor",
            description =
                    "Deleting the document leaves nothing to act on, so its incidents drop out of"
                            + " the queue while the rows stay for audit. Applies only to the"
                            + " caller's own editor rows, however senior they are.")
    public Response filesRemoved(RemovedFiles request) {
        service.forgetFiles(request == null ? List.of() : request.safeFileIds());
        // No body: the editor is telling the server, not asking it anything.
        return Response.noContent().build();
    }

    @GET
    @Path("/kinds")
    @Produces(MediaType.APPLICATION_JSON)
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
    private static Response.Status statusFor(FailureActionException.Reason reason) {
        return switch (reason) {
            case EVENT_NOT_FOUND -> Response.Status.NOT_FOUND;
            case ACTION_NOT_RECOGNISED, ACTION_NOT_DECLARED -> Response.Status.BAD_REQUEST;
            case ALREADY_CLOSED -> Response.Status.CONFLICT;
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

    /**
     * Inputs an action declared it needs. Empty for every action the server runs today: the one
     * that needs a password is run by the client, which never sends it here.
     */
    public record ActionRequest(Map<String, String> inputs) {

        public Map<String, String> safeInputs() {
            return inputs == null ? Map.of() : inputs;
        }
    }
}
