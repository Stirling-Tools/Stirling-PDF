package stirling.software.proprietary.notification;

import java.util.List;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.failure.FileRunEvent;
import stirling.software.proprietary.failure.FileRunEventService;
import stirling.software.proprietary.failure.FileRunEventView;

/**
 * Assembles the caller's notifications from whatever produces them. Derived on read rather than
 * stored: there is one source today, and a table would need a write path, a retention story and a
 * per-user read model before it earned itself.
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
