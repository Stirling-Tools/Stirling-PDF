package stirling.software.proprietary.notification;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

/**
 * Open to any authenticated user, unlike the failure endpoints it draws on: each source scopes its
 * own rows. Read-only, because every action a notification offers runs on the client's own device.
 */
@RestController
@RequestMapping("/api/v1/notifications")
@Hidden
@RequiredArgsConstructor
@Tag(name = "Notifications", description = "Things worth telling the caller about")
public class NotificationController {

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

    /** Wrapped so paging or a total can be added without breaking clients. */
    public record NotificationsResponse(List<NotificationView> notifications) {}
}
