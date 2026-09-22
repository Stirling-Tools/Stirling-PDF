package stirling.software.proprietary.notification;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.failure.FailureActionId;
import stirling.software.proprietary.failure.FailureScope;
import stirling.software.proprietary.failure.FileRunEvent;
import stirling.software.proprietary.failure.FileRunEventService;
import stirling.software.proprietary.failure.FileRunEventView;
import stirling.software.proprietary.failure.Ownership;
import stirling.software.proprietary.failure.SourceKind;
import stirling.software.proprietary.policy.ledger.StorageFileIdentities;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

/**
 * Derived on read rather than stored: one source today, and a table would need a write path,
 * retention and a per-user read model first. Each source scopes its own rows, so this cannot widen.
 */
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final FileRunEventService fileRunEvents;
    private final StoredFileRepository storedFiles;

    /**
     * Newest first, and only open failures that name a document or a source that could not be read:
     * one already dealt with is not news, and a row naming neither has nothing to offer.
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
                .filter(event -> namesADocument(event) || event.scope() == FailureScope.SOURCE)
                .map(event -> fromFailure(event, kinds))
                .toList();
    }

    /**
     * What to call the document, derived per read and only for the row's own owner. Only a
     * storage-backed folder can answer: a disk folder's identity is a path, which would disclose
     * it.
     */
    private String documentNameFor(FileRunEvent event, Ownership ownership) {
        if (ownership != Ownership.MINE || event.actor() == null) {
            return null;
        }
        Long storedFileId = StorageFileIdentities.storedFileIdOf(event.fileId());
        if (storedFileId == null) {
            return null;
        }
        return storedFiles
                .findById(storedFileId)
                // Belt and braces over the ownership above: that says the reader raised the row,
                // this says the document is theirs. A row can outlive the file it named.
                .filter(file -> file.getOwner() != null)
                .filter(file -> event.actor().equals(file.getOwner().getUsername()))
                .map(StoredFile::getOriginalFilename)
                .orElse(null);
    }

    private static boolean namesADocument(FileRunEvent event) {
        return event.fileId() != null && !event.fileId().isBlank();
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
     * Run one of the row's own server actions, addressed by prefixed id. Nothing is authorised
     * here: the producing service re-checks the row and the action, and each action guards its own
     * effects.
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
        SourceKind source = fileRunEvents.sourceKindOf(event, kinds);
        FileRunEventView.DocumentLocation location =
                FileRunEventView.DocumentLocation.of(event, source);
        boolean resolvableHere = location == FileRunEventView.DocumentLocation.BROWSER;
        Ownership ownership = fileRunEvents.ownershipOf(event);
        return new NotificationView(
                NotificationSource.FAILURE.qualify(event.id()),
                NotificationSource.FAILURE,
                event.kind().getId(),
                event.origin(),
                ownership,
                event.severity(),
                event.status(),
                event.kind().getTitleKey(),
                event.kind().getDefaultTitle(),
                event.detail(),
                // Only an id this reader's own client minted. A source's reference is a location on
                // the server's disk, and no client has anything to match it against.
                resolvableHere ? event.fileId() : null,
                resolvableHere ? null : documentNameFor(event, ownership),
                location,
                source,
                event.sourceId(),
                event.policyId(),
                event.occurrences(),
                event.createdAt(),
                event.lastSeenAt(),
                bellActions(event, source));
    }

    /**
     * What the bell may offer: every fix, including the ones the server carries out, but not a
     * disposition, which is the review surface's to apply. A new disposition belongs in this list.
     */
    private List<FileRunEventView.ActionView> bellActions(FileRunEvent event, SourceKind source) {
        return fileRunEvents.availableActions(event, source).stream()
                .filter(
                        action ->
                                action.id() != FailureActionId.DISMISS
                                        && action.id() != FailureActionId.ACKNOWLEDGE)
                .map(FileRunEventView.ActionView::of)
                .toList();
    }
}
