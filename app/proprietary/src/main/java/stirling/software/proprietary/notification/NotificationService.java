package stirling.software.proprietary.notification;

import java.util.List;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.failure.FileRunEvent;
import stirling.software.proprietary.failure.FileRunEventService;
import stirling.software.proprietary.failure.FileRunEventView;

/**
 * Derived on read rather than stored: one source today, and a table would need a write path,
 * retention and a per-user read model first. Each source scopes its own rows, so this cannot widen.
 */
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final FileRunEventService fileRunEvents;

    /** Newest first, and only open failures: one already dealt with is not news. */
    public List<NotificationView> list(int limit) {
        return fileRunEvents.list(null, null, limit).stream().map(this::fromFailure).toList();
    }

    /**
     * Whether the caller sees the whole team's incidents rather than only their own. The client
     * uses it to hide a member's rows whose document is not in this browser, which it alone knows.
     */
    public boolean callerReviewsTeam() {
        return fileRunEvents.reviewsTeam();
    }

    /**
     * Record that the client's own retry of this notification worked. Takes the prefixed id, so the
     * bell cannot reach a failure endpoint even by accident.
     *
     * @throws IllegalArgumentException if the id names no source this build has
     * @throws stirling.software.proprietary.failure.FailureActionException if the source refuses,
     *     e.g. a row a reviewer has since dismissed
     */
    public NotificationView resolve(String notificationId) {
        NotificationSource.QualifiedId qualified = qualify(notificationId);
        return switch (qualified.source()) {
            case FAILURE -> fromFailure(fileRunEvents.resolve(qualified.rowId()));
        };
    }

    /** The source and row id behind a notification id, refusing anything that is not one. */
    private static NotificationSource.QualifiedId qualify(String notificationId) {
        return NotificationSource.parse(notificationId)
                .orElseThrow(
                        () ->
                                new IllegalArgumentException(
                                        "Not a notification id: " + notificationId));
    }

    /** Prefixes the row id on the way out, so it is never sent bare. */
    private NotificationView fromFailure(FileRunEvent event) {
        return new NotificationView(
                NotificationSource.FAILURE.qualify(event.id()),
                NotificationSource.FAILURE,
                event.kind().getId(),
                event.origin(),
                fileRunEvents.ownershipOf(event),
                event.severity(),
                event.status(),
                event.kind().getTitleKey(),
                event.kind().getDefaultTitle(),
                event.detail(),
                event.fileId(),
                event.sourceId(),
                event.policyId(),
                event.occurrences(),
                event.createdAt(),
                event.lastSeenAt(),
                // A disposition such as Dismiss belongs to the review surface, not the bell.
                fileRunEvents.availableActions(event).stream()
                        .filter(action -> !action.id().runsOnServer())
                        .map(FileRunEventView.ActionView::of)
                        .toList());
    }
}
