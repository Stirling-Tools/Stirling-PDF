package stirling.software.proprietary.notification;

import java.util.List;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.failure.FileRunEvent;
import stirling.software.proprietary.failure.FileRunEventService;
import stirling.software.proprietary.failure.FileRunEventView;

/**
 * Assembles the caller's notifications from whatever produces them, and routes a client's report of
 * its own fix back to whichever source produced the row. Derived on read rather than stored: there
 * is one source today, and a table would need a write path, a retention story and a per-user read
 * model before it earned itself.
 *
 * <p>Who sees what is decided by each source rather than here. {@link FileRunEventService} already
 * scopes its reads and resolves each row's actions against that reader, so this cannot widen either
 * by accident.
 */
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final FileRunEventService fileRunEvents;

    /**
     * The caller's notifications, newest first. Only open failures: a dismissed or resolved one has
     * been dealt with and is not news.
     */
    public List<NotificationView> list(int limit) {
        return fileRunEvents.list(null, null, limit).stream().map(this::fromFailure).toList();
    }

    /**
     * Record that the client's own retry of this notification worked, and return it as it now
     * stands. Takes the prefixed id even though nobody pressed a button: it is still a call made
     * from the bell, and the bell holds no raw failure id, so it cannot reach a failure endpoint
     * even by accident.
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

    /**
     * One failure as a notification, with its row id prefixed on the way out and never sent bare.
     */
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
                // The failure surface's own offers, filtered to the ones the client itself runs.
                // A disposition such as Dismiss belongs to the review surface, not the bell.
                fileRunEvents.availableActions(event).stream()
                        .filter(action -> !action.id().runsOnServer())
                        .map(FileRunEventView.ActionView::of)
                        .toList());
    }
}
