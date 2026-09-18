package stirling.software.proprietary.notification;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.failure.FailureActionId;
import stirling.software.proprietary.failure.FileRunEvent;
import stirling.software.proprietary.failure.FileRunEventService;
import stirling.software.proprietary.failure.FileRunEventView;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Derived on read rather than stored: one source today, and a table would need a write path,
 * retention and a per-user read model first. Each source scopes its own rows, so this cannot widen.
 */
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final FileRunEventService fileRunEvents;
    private final PolicyStore policyStore;

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
        // One lookup per distinct policy rather than per row: a folder that fails a whole batch is
        // one policy and twenty rows.
        Map<String, SourceKind> kinds = new HashMap<>();
        return fileRunEvents.list(null, false, null, limit).stream()
                .filter(event -> event.fileId() != null && !event.fileId().isBlank())
                .map(event -> fromFailure(event, kinds))
                .toList();
    }

    /**
     * What produced the row. Read from the policy rather than stored on the row, so a folder that
     * was converted to a policy (or the reverse) reads as what it is now.
     */
    private SourceKind sourceKindOf(FileRunEvent event, Map<String, SourceKind> cache) {
        if (event.policyId() == null || event.policyId().isBlank()) {
            return SourceKind.EDITOR;
        }
        return cache.computeIfAbsent(
                event.policyId(),
                policyId -> SourceKind.of(policyStore.get(policyId).orElse(null)));
    }

    /** Whether the caller sees the whole team's incidents rather than only their own. */
    public boolean callerReviewsTeam() {
        return fileRunEvents.reviewsTeam();
    }

    public String callerViewerKey() {
        return fileRunEvents.viewerKey();
    }

    /** Takes the prefixed id, so the bell cannot reach a failure endpoint even by accident. */
    public NotificationView resolve(String notificationId) {
        NotificationSource.QualifiedId qualified = qualify(notificationId);
        return switch (qualified.source()) {
            case FAILURE -> fromFailure(fileRunEvents.resolve(qualified.rowId()), new HashMap<>());
        };
    }

    /**
     * Run one of the row's own server actions, addressed the way the bell holds it. The prefix is
     * the whole reason this exists rather than the bell calling the failure endpoint directly.
     *
     * <p>Nothing is decided here: the producing service re-checks that the caller may see the row
     * and that its kind declares the action, and each action authorises its own effects.
     */
    public NotificationView act(String notificationId, String actionId) {
        NotificationSource.QualifiedId qualified = qualify(notificationId);
        return switch (qualified.source()) {
            case FAILURE ->
                    fromFailure(
                            fileRunEvents.dispatch(qualified.rowId(), actionId, Map.of()),
                            new HashMap<>());
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
    private NotificationView fromFailure(FileRunEvent event, Map<String, SourceKind> kinds) {
        FileRunEventView.DocumentLocation location = FileRunEventView.DocumentLocation.of(event);
        boolean resolvableHere = location == FileRunEventView.DocumentLocation.BROWSER;
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
                // Only an id this reader's own client minted. A source's reference is a location on
                // the server's disk, and no client has anything to match it against.
                resolvableHere ? event.fileId() : null,
                location,
                sourceKindOf(event, kinds),
                event.sourceId(),
                event.policyId(),
                event.occurrences(),
                event.createdAt(),
                event.lastSeenAt(),
                bellActions(event));
    }

    /**
     * What the bell may offer. A disposition such as Dismiss belongs to the review surface, and a
     * server action is kept out for the same reason — except the one that re-runs a document only
     * the server can reach, which is the sole fix available to the reader of a smart-folder row.
     */
    private List<FileRunEventView.ActionView> bellActions(FileRunEvent event) {
        return fileRunEvents.availableActions(event).stream()
                .filter(
                        action ->
                                !action.id().runsOnServer()
                                        || action.id() == FailureActionId.RETRY_IN_FOLDER)
                .map(FileRunEventView.ActionView::of)
                .toList();
    }
}
