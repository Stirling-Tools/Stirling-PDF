package stirling.software.proprietary.failure;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

/**
 * Reads and acts on the incidents the calling user is allowed to see, which is where that decision
 * is made: a leader reads and closes the whole team's failures, everyone else their own. Keeping it
 * here rather than on the endpoints means the read and the triage cannot drift apart.
 *
 * <p>Team scoping mirrors {@code PolicyAccessGuard}: everyone sees only their own team's rows, the
 * team always comes from the authenticated principal, and scoping applies only when login is
 * enabled so single-user deployments keep working. When the team cannot be resolved the caller
 * reads nothing; see {@link #readScope()}.
 *
 * <p>Seeing an incident and being able to act on it are separate questions: the read scope decides
 * the first, {@link #availableActions} the second.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FileRunEventService {

    /** Why an offered action came back disabled. Copy lives under {@code portal.failures}. */
    private static final String CLOSED_REASON_KEY = "portal.failures.disabled.closed";

    private static final String UNATTENDED_REASON_KEY = "portal.failures.disabled.unattended";

    /** The row never named a document, so unlike the unattended case no client can find one. */
    private static final String DOCUMENTLESS_REASON_KEY = "portal.failures.disabled.noDocument";

    private final FileRunEventStore store;
    private final FailureActionRegistry actionRegistry;
    private final PolicyManagementAuthority policyManagementAuthority;
    private final UserServiceInterface userService;
    private final ApplicationProperties applicationProperties;

    /**
     * Record a failure a user hit in the editor. One incident per named file, so each document
     * stays separately actionable; one unattributed incident when the report names none.
     *
     * <p>The team and actor come from the session rather than the report, and the kind is
     * classified from the reported code, falling back to {@link FailureKind#UNKNOWN} for a code no
     * kind claims.
     */
    public List<FileRunEvent> report(EditorFailureReport report) {
        FailureKind kind = FailureKind.byErrorCode(report.errorCode()).orElse(FailureKind.UNKNOWN);
        // The caller's team, not their read scope: recording is open to everyone, and a reader who
        // may see nothing still has their failure filed under the team it happened in.
        Long teamId = currentTeamId();
        String actor = currentActor();
        String detail = detailFor(report);

        List<String> fileIds =
                report.fileIds().stream().filter(id -> id != null && !id.isBlank()).toList();
        if (fileIds.isEmpty()) {
            return List.of(recordReported(kind, teamId, actor, null, detail));
        }
        // Every named file gets its row. An earlier cap here silently dropped the rest, which lost
        // failures a reviewer needed and was inconsistent with the processor path, where a sweep
        // records one row per failing file with no limit at all. How many files one report may name
        // is bounded at the boundary instead (see EditorFailureReport#MAX_FILE_IDS), where an
        // oversized report can be refused whole before anything is written.
        return fileIds.stream()
                .map(fileId -> recordReported(kind, teamId, actor, fileId, detail))
                .toList();
    }

    private FileRunEvent recordReported(
            FailureKind kind, Long teamId, String actor, String fileId, String detail) {
        return store.record(RecordFailure.forEditor(kind, teamId, actor, fileId, detail));
    }

    /**
     * The operation is the context a reviewer needs, since an editor failure has no policy or run.
     */
    private String detailFor(EditorFailureReport report) {
        String message = report.detail() == null ? "" : report.detail();
        return message.isBlank() ? report.operation() : report.operation() + ": " + message;
    }

    /**
     * Close the incidents about documents the caller has deleted from their editor. The queue means
     * "needs attention", and a document that no longer exists needs none; the rows stay for audit.
     *
     * <p>Best-effort by nature: this only arrives if the browser that owns the file says so, and a
     * cleared cache or another device never will. Rows left open that way are retention's problem,
     * not this method's.
     *
     * <p>Narrowed to the caller's own rows however senior they are, which is why it passes {@link
     * #currentActor()} rather than the read scope's actor: file ids are minted by each client, so a
     * leader reading with a null actor would match every unattributed row in the team.
     *
     * @return how many incidents were closed
     */
    public int forgetFiles(List<String> fileIds) {
        ReadScope scope = readScope();
        if (!scope.permitted()) {
            return 0;
        }
        List<String> named = fileIds.stream().filter(id -> id != null && !id.isBlank()).toList();
        return store.markFilesRemoved(scope.teamId(), currentActor(), named);
    }

    /**
     * The events the caller may read, newest first: the team's for a leader, their own for everyone
     * else. Empty when their team cannot be resolved.
     */
    public List<FileRunEvent> list(FileRunEventStatus status, String kindId, int limit) {
        ReadScope scope = readScope();
        if (!scope.permitted()) {
            return List.of();
        }
        return store.list(scope.teamId(), status, kindId, scope.actor(), limit);
    }

    /**
     * Dispatch an action against one event.
     *
     * @throws FailureActionException if the event is not the caller's, the action is unknown, the
     *     event's kind does not declare the action, the client is what runs the action, or the
     *     event is already closed
     */
    public FileRunEvent dispatch(String eventId, String actionId, Map<String, String> inputs) {
        // Whoever can see it can close it: a leader for the whole team, everyone else for the
        // failures they caused. Someone who fixes their own problem should not have to ask a leader
        // to clear the row.
        //
        // Audience decides what is offered, not what may be dispatched, so this read scope is the
        // whole gate. A server action aimed at OWNER alone would need its own guard here.
        FileRunEvent event = requireVisible(eventId);

        FailureActionId resolvedId = parseActionId(actionId);

        // A kind that does not offer an action cannot have it applied, so an action that makes no
        // sense for a failure is unreachable rather than merely unrendered.
        if (!event.kind().declares(resolvedId)) {
            throw new FailureActionException(
                    FailureActionException.Reason.ACTION_NOT_DECLARED,
                    "Kind " + event.kind().getId() + " does not offer action " + resolvedId);
        }
        // Declared, and still not the server's to run: without this a client could post VIEW_FILE
        // and be answered as though something had happened, when nothing here has the file.
        if (!resolvedId.runsOnServer()) {
            throw new FailureActionException(
                    FailureActionException.Reason.ACTION_NOT_DISPATCHABLE,
                    "Action " + resolvedId + " is run by the client, not the server");
        }
        if (event.status().terminal()) {
            throw new FailureActionException(
                    FailureActionException.Reason.ALREADY_CLOSED,
                    "Event " + eventId + " is already " + event.status());
        }

        FailureAction action =
                actionRegistry
                        .find(resolvedId)
                        .orElseThrow(
                                () ->
                                        new FailureActionException(
                                                FailureActionException.Reason.ACTION_NOT_RECOGNISED,
                                                "No handler for action " + resolvedId));

        return action.execute(event, inputs == null ? Map.of() : inputs, currentActor());
    }

    /**
     * Mark an incident resolved, because a client retried the operation and it worked. Nobody is
     * offered a "resolve" button, which is why {@code RESOLVED} is a status and not a {@link
     * FailureActionId}. Idempotent: a client reporting the same success twice reads its row back.
     *
     * @throws FailureActionException if the event is not the caller's, or is already closed some
     *     other way
     */
    public FileRunEvent resolve(String eventId) {
        FileRunEvent event = requireVisible(eventId);
        // No terminal pre-check: the store's guarded UPDATE decides, and tells a dismissed row
        // apart from a deleted one after the fact rather than racing a read against the write.
        return store.applyStatusOnce(
                event.id(),
                event.teamId(),
                FileRunEventStatus.RESOLVED,
                currentActor(),
                FileRunEventStatus.open());
    }

    /**
     * The event, if this caller may act on it at all. Reported as "no such event" rather than a
     * refusal, so a member cannot learn that a colleague's incident exists by trying to close it.
     */
    private FileRunEvent requireVisible(String eventId) {
        ReadScope scope = readScope();
        if (!scope.permitted()) {
            return notFound(eventId);
        }
        return store.find(eventId, scope.teamId())
                .filter(found -> scope.actor() == null || scope.actor().equals(found.actor()))
                .orElseGet(() -> notFound(eventId));
    }

    private FileRunEvent notFound(String eventId) {
        throw new FailureActionException(
                FailureActionException.Reason.EVENT_NOT_FOUND, "No such event: " + eventId);
    }

    /** Whose incident this is, as far as the caller is concerned. See {@link Ownership}. */
    public Ownership ownershipOf(FileRunEvent event) {
        if (event.actor() == null) {
            return Ownership.UNOWNED;
        }
        String caller = currentActor();
        return event.actor().equals(caller) ? Ownership.MINE : Ownership.THEIRS;
    }

    /**
     * Which of an event's declared actions this caller is offered, and which are usable right now,
     * so the client never renders a button that would be refused. An action outside the caller's
     * audience is dropped rather than disabled: a greyed-out "Decrypt and retry" would read as a
     * permission problem when it is simply not their document.
     */
    public List<AvailableAction> availableActions(FileRunEvent event) {
        Ownership ownership = ownershipOf(event);
        boolean reviewsTeam = reviewsTeam();
        boolean closed = event.status().terminal();
        // Nobody's client is holding the document, so an owner action has nothing to act on. A
        // login-disabled deployment is excluded: its rows are unowned only because it has no users,
        // and its one operator owns everything they can see.
        boolean unattended = enforced() && ownership == Ownership.UNOWNED;
        // No document reference at all, so an owner action has nothing to name even when the owner
        // is right here holding the file. Answered here rather than left to the client, which would
        // otherwise report "not on this device" about a document the row never identified.
        boolean documentless = event.fileId() == null || event.fileId().isBlank();
        return event.kind().getOfferedActions().stream()
                .filter(offer -> offeredTo(offer.audience(), ownership, reviewsTeam))
                .map(offer -> availability(offer, closed, unattended, documentless))
                .toList();
    }

    /** Enabled is derived from the reason, so a disabled button always has one to show. */
    private static AvailableAction availability(
            FailureKind.OfferedAction offer,
            boolean closed,
            boolean unattended,
            boolean documentless) {
        String reason = disabledReasonFor(offer.audience(), closed, unattended, documentless);
        return new AvailableAction(
                offer.id(), offer.labelKey(), offer.slot(), reason == null, reason);
    }

    /**
     * Why an offer cannot be taken right now, or null when it can. Closed wins over everything,
     * then the owner-only reasons, most specific first.
     */
    private static String disabledReasonFor(
            FailureAudience audience, boolean closed, boolean unattended, boolean documentless) {
        if (closed) {
            return CLOSED_REASON_KEY;
        }
        if (audience != FailureAudience.OWNER) {
            return null;
        }
        if (unattended) {
            return UNATTENDED_REASON_KEY;
        }
        return documentless ? DOCUMENTLESS_REASON_KEY : null;
    }

    /**
     * Whether an offer aimed at {@code audience} is this caller's to take. An unattended incident
     * has no owner, so its reviewer inherits the owner's actions; otherwise nobody is offered them
     * at all.
     */
    private static boolean offeredTo(
            FailureAudience audience, Ownership ownership, boolean reviewsTeam) {
        return switch (audience) {
            case OWNER ->
                    ownership == Ownership.MINE || (ownership == Ownership.UNOWNED && reviewsTeam);
            case TEAM_REVIEWER -> reviewsTeam;
            case ANYONE_WHO_SEES -> true;
        };
    }

    /** Whether the caller triages the whole team's incidents, rather than only their own. */
    public boolean reviewsTeam() {
        return !enforced() || policyManagementAuthority.canEditPolicies();
    }

    private FailureActionId parseActionId(String actionId) {
        for (FailureActionId candidate : FailureActionId.values()) {
            if (candidate.name().equals(actionId)) {
                return candidate;
            }
        }
        throw new FailureActionException(
                FailureActionException.Reason.ACTION_NOT_RECOGNISED, "Unknown action: " + actionId);
    }

    /**
     * Which rows the caller may read. A leader reviews the whole team's, as before. Everyone else
     * reads the failures they caused themselves: a member can already report one, so letting them
     * see their own back is what makes telling them about it worth anything, and it exposes nothing
     * of a colleague's.
     *
     * <p>A null team id means two different things. Login disabled is the self-hosted setup with no
     * users or teams, where unteamed rows are everyone's, as {@code PolicyAccessGuard} also treats
     * them. Login enabled with no resolvable team reads nothing, because unteamed rows there are
     * shared by every team's ad-hoc runs.
     */
    private ReadScope readScope() {
        if (!enforced()) {
            return ReadScope.wholeTeam(null);
        }
        Long teamId = currentTeamId();
        if (teamId == null) {
            return ReadScope.denied();
        }
        if (policyManagementAuthority.canEditPolicies()) {
            return ReadScope.wholeTeam(teamId);
        }
        // Narrowing to "mine" needs a name to narrow by. Without one the filter would be dropped
        // and a member would read the whole team, so refuse rather than widen.
        String actor = currentActor();
        return actor == null ? ReadScope.denied() : ReadScope.mine(teamId, actor);
    }

    /**
     * What the caller may read. {@code actor} is the person to narrow to, or null for the whole
     * team; both are only meaningful when permitted.
     */
    private record ReadScope(boolean permitted, Long teamId, String actor) {

        static ReadScope wholeTeam(Long teamId) {
            return new ReadScope(true, teamId, null);
        }

        static ReadScope mine(Long teamId, String actor) {
            return new ReadScope(true, teamId, actor);
        }

        static ReadScope denied() {
            return new ReadScope(false, null, null);
        }
    }

    /** The team a row belongs to, which is nobody's when there are no teams to belong to. */
    private Long currentTeamId() {
        return enforced() ? policyManagementAuthority.currentUserTeamId() : null;
    }

    private String currentActor() {
        return enforced() ? userService.getCurrentUsername() : null;
    }

    private boolean enforced() {
        return applicationProperties.getSecurity().isEnableLogin();
    }

    /**
     * One action as offered to one caller about one event, with its availability resolved. {@code
     * slot} is the kind's placement intent, carried through for the client to make the final call.
     */
    public record AvailableAction(
            FailureActionId id,
            String labelKey,
            FailureActionSlot slot,
            boolean enabled,
            String disabledReasonKey) {}
}
