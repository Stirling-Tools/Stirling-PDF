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
 * Open to any authenticated user: each source scopes its own rows. Every action runs on the
 * client's own device, so the only write is it reporting a fix.
 */
@RestController
@RequestMapping("/api/v1/notifications")
@Hidden
@RequiredArgsConstructor
@Tag(name = "Notifications", description = "Things worth telling the caller about")
public class NotificationController {

    /** How many notifications one read returns when the caller does not say: one panelful. */
    private static final int DEFAULT_LIMIT = 20;

    /** The most one read may return however large a limit the caller asks for. */
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

    /** Wrapped so paging or a total can be added without breaking clients. */
    public record NotificationsResponse(
            List<NotificationView> notifications, boolean viewerReviewsTeam) {}
}
