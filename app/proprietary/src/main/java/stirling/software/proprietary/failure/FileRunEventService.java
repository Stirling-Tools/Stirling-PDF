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
 * Reads and acts on incidents for the calling user's team.
 *
 * <p>Team scoping mirrors {@code PolicyAccessGuard}: everyone sees only their own team's rows, the
 * team always comes from the authenticated principal, and scoping applies only when login is
 * enabled so single-user deployments keep working. When the team cannot be resolved the caller
 * reads nothing; see {@link #scope()}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FileRunEventService {

    private final FileRunEventStore store;
    private final FailureActionRegistry actionRegistry;
    private final PolicyManagementAuthority policyManagementAuthority;
    private final UserServiceInterface userService;
    private final ApplicationProperties applicationProperties;

    /** The calling user's events, newest first. Empty when their team cannot be resolved. */
    public List<FileRunEvent> list(FileRunEventStatus status, String kindId, int limit) {
        TeamScope scope = scope();
        if (!scope.permitted()) {
            return List.of();
        }
        return store.list(scope.teamId(), status, kindId, limit);
    }

    /**
     * Dispatch an action against one event.
     *
     * @throws FailureActionException if the event is not the caller's, the action is unknown, the
     *     event's kind does not declare the action, or the event is already closed
     */
    public FileRunEvent dispatch(String eventId, String actionId, Map<String, String> inputs) {
        TeamScope scope = scope();
        if (!scope.permitted()) {
            // Reported as "no such event", the same as an id from another team, so the response
            // does
            // not depend on whether the id happens to exist.
            throw new FailureActionException(
                    FailureActionException.Reason.EVENT_NOT_FOUND, "No such event: " + eventId);
        }
        FileRunEvent event =
                store.find(eventId, scope.teamId())
                        .orElseThrow(
                                () ->
                                        new FailureActionException(
                                                FailureActionException.Reason.EVENT_NOT_FOUND,
                                                "No such event: " + eventId));

        FailureActionId resolvedId = parseActionId(actionId);

        // A kind that does not offer an action cannot have it applied, so an action that makes no
        // sense for a failure is unreachable rather than merely unrendered.
        if (!event.kind().declares(resolvedId)) {
            throw new FailureActionException(
                    FailureActionException.Reason.ACTION_NOT_DECLARED,
                    "Kind " + event.kind().getId() + " does not offer action " + resolvedId);
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
     * Which of an event's declared actions are usable right now. Decided per row, so the client
     * never renders a button that would be refused.
     */
    public List<AvailableAction> availableActions(FileRunEvent event) {
        boolean closed = event.status().terminal();
        return event.kind().getActions().stream()
                .map(
                        action ->
                                new AvailableAction(
                                        action,
                                        event.kind().labelKeyFor(action),
                                        !closed,
                                        closed ? "processor.failures.disabled.closed" : null))
                .toList();
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
     * Which rows the caller may touch, since a null team id means two different things. Login
     * disabled is the self-hosted setup with no users or teams, where unteamed rows are everyone's,
     * as {@code PolicyAccessGuard} also treats them. Login enabled with no resolvable team reads
     * nothing, because unteamed rows there are shared by every team's ad-hoc runs.
     */
    private TeamScope scope() {
        if (!enforced()) {
            return TeamScope.of(null);
        }
        Long teamId = policyManagementAuthority.currentUserTeamId();
        return teamId == null ? TeamScope.denied() : TeamScope.of(teamId);
    }

    /**
     * The caller's readable team, or a refusal. {@code teamId} is only meaningful when permitted.
     */
    private record TeamScope(boolean permitted, Long teamId) {

        static TeamScope of(Long teamId) {
            return new TeamScope(true, teamId);
        }

        static TeamScope denied() {
            return new TeamScope(false, null);
        }
    }

    private String currentActor() {
        return enforced() ? userService.getCurrentUsername() : null;
    }

    private boolean enforced() {
        return applicationProperties.getSecurity().isEnableLogin();
    }

    /** One action as offered for a specific event, with its resolved availability. */
    public record AvailableAction(
            FailureActionId id, String labelKey, boolean enabled, String disabledReasonKey) {}
}
