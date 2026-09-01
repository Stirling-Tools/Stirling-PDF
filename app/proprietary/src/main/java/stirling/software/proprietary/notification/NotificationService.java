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

    /**
     * Newest first, and only open failures about a document: one already dealt with is not news,
     * and a row naming no file has nothing the bell can offer beyond saying so.
     *
     * <p>Filtered on the named file rather than the kind's scope, because a RUN-scoped kind still
     * names one when the editor reported it: a failed tool run belongs here. Applied after the
     * limit, so a page can come back short while unattributed rows exist - the review surface is
     * where those are meant to be read, and it lists them unfiltered.
     */
    public List<NotificationView> list(int limit) {
        return fileRunEvents.list(null, null, limit).stream()
                .filter(event -> event.fileId() != null && !event.fileId().isBlank())
                .map(this::fromFailure)
                .toList();
    }

    /** Whether the caller sees the whole team's incidents rather than only their own. */
    public boolean callerReviewsTeam() {
        return fileRunEvents.reviewsTeam();
    }

    /** Opaque and stable, so a shared browser can keep one viewer's read state off another's. */
    public String callerViewerKey() {
        return fileRunEvents.viewerKey();
    }

    /** Takes the prefixed id, so the bell cannot reach a failure endpoint even by accident. */
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
