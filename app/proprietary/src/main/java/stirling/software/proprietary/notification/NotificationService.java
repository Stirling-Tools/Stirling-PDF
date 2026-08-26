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
