package stirling.software.proprietary.notification;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.failure.FailureActionException;

/**
 * The caller's notifications. Open to any authenticated user, unlike the failure endpoints it draws
 * on: each source scopes its own rows and resolves its own actions, so a member is told about their
 * own failures and a leader about their team's.
 *
 * <p>Every action a notification offers is one the client runs on its own device, so the only write
 * here is the client reporting that its own retry worked. Ids are prefixed with their source, so
 * the bell is never given the producing row's id; see {@link NotificationSource}.
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
        return new NotificationsResponse(
                notifications.list(capped), notifications.callerReviewsTeam());
    }

    /**
     * Record that the client's own retry of this notification worked. A mirror of the failure
     * surface's resolve semantics rather than a client that strips the prefix, because the bell
     * must never hand a raw failure id to a failure endpoint.
     *
     * <p>Idempotent. A row a reviewer has since dismissed is a conflict, not a silent overwrite of
     * their decision.
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
     * {@code viewerReviewsTeam} lets the client filter a member's list; see {@link
     * NotificationService#callerReviewsTeam()}.
     */
    public record NotificationsResponse(
            List<NotificationView> notifications, boolean viewerReviewsTeam) {}
}
