package stirling.software.proprietary.notification;

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

import stirling.software.proprietary.failure.FailureActionException;
import stirling.software.proprietary.failure.FileRunEventController;

/**
 * The caller's notifications, and the actions they offer. Open to any authenticated user, unlike
 * the failure endpoints it draws on: each source scopes its own rows and resolves its own actions,
 * so a member is told about their own failures and a leader about their team's.
 *
 * <p>Every id on this API is the prefixed notification id. The bell is never given the producing
 * row's id, so it cannot call that source's endpoints directly; see {@link NotificationSource}.
 */
@RestController
@RequestMapping("/api/v1/notifications")
@Hidden
@RequiredArgsConstructor
@Tag(name = "Notifications", description = "Things worth telling the caller about")
public class NotificationController {

    /** One page of a bell. Enough to fill a panel; the badge counts what it is given. */
    private static final int DEFAULT_LIMIT = 20;

    private static final int MAX_LIMIT = 100;

    private final NotificationService notifications;

    @GetMapping
    @Operation(
            summary = "List the caller's notifications",
            description =
                    "Newest first. Derived from the sources that produce them, so there is nothing"
                            + " to mark read here yet: the client tracks what it has shown.")
    public NotificationsResponse list(@RequestParam(required = false) Integer limit) {
        int capped = Math.min(limit == null ? DEFAULT_LIMIT : Math.max(1, limit), MAX_LIMIT);
        return new NotificationsResponse(notifications.list(capped));
    }

    /**
     * Apply one of a notification's own offered actions.
     *
     * <p>Exists so the bell can act without ever being handed a raw failure id: the prefix says
     * which source to ask, and that source's own service applies the action under its own rules. An
     * id whose prefix names a source this build does not have is a bad request rather than a 404,
     * since it was never a notification id.
     */
    @PostMapping("/{notificationId}/actions/{actionId}")
    @Operation(
            summary = "Apply an action to a notification",
            description =
                    "Takes the prefixed notification id, not the producing row's id, and delegates"
                            + " to whichever source produced it. Refused the same way that source"
                            + " would refuse it on its own surface.")
    public NotificationView act(
            @PathVariable String notificationId,
            @PathVariable String actionId,
            @RequestBody(required = false) FileRunEventController.ActionRequest request) {
        Map<String, String> inputs = request == null ? Map.of() : request.safeInputs();
        try {
            return notifications.act(notificationId, actionId, inputs);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage(), e);
        } catch (FailureActionException e) {
            // Same table the failure surface uses, so the bell and the queue answer alike.
            throw new ResponseStatusException(
                    FailureActionException.statusOf(e.getReason()), e.getMessage(), e);
        }
    }

    /**
     * Record that the client's own retry of this notification worked. A mirror of the failure
     * surface's resolve route rather than a client that strips the prefix, because the bell must
     * never hand a raw failure id to a failure endpoint.
     *
     * <p>Idempotent, like the route it mirrors. A row a reviewer has since dismissed is a conflict,
     * not a silent overwrite of their decision.
     */
    @PostMapping("/{notificationId}/resolved")
    @Operation(
            summary = "Record that a client-side retry fixed what a notification was about",
            description =
                    "Takes the prefixed notification id, not the producing row's id. Not an action:"
                            + " nobody is offered a resolve button, and a recurrence brings the"
                            + " notification back.")
    public NotificationView resolved(@PathVariable String notificationId) {
        try {
            return notifications.resolve(notificationId);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage(), e);
        } catch (FailureActionException e) {
            throw new ResponseStatusException(
                    FailureActionException.statusOf(e.getReason()), e.getMessage(), e);
        }
    }

    /**
     * Wrapped rather than a bare array so paging or a total can be added without breaking clients.
     */
    public record NotificationsResponse(List<NotificationView> notifications) {}
}
