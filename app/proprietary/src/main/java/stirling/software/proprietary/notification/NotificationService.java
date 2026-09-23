package stirling.software.proprietary.notification;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.failure.FailureActionId;
import stirling.software.proprietary.failure.FailureScope;
import stirling.software.proprietary.failure.FileRunEvent;
import stirling.software.proprietary.failure.FileRunEventService;
import stirling.software.proprietary.failure.FileRunEventView;
import stirling.software.proprietary.failure.Ownership;
import stirling.software.proprietary.failure.ProducingSurface;
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
    public Page page(int limit) {
        FileRunEventService.Viewer viewer = fileRunEvents.viewer();
        return new Page(list(viewer, limit), viewer.reviewsTeam(), fileRunEvents.viewerKey(viewer));
    }

    public record Page(
            List<NotificationView> notifications, boolean viewerReviewsTeam, String viewerKey) {}

    private List<NotificationView> list(FileRunEventService.Viewer viewer, int limit) {
        // One lookup per distinct policy rather than per row: a folder that fails a whole batch is
        // one policy and twenty rows.
        Map<String, ProducingSurface> kinds = new HashMap<>();
        List<FileRunEvent> events =
                fileRunEvents.list(viewer, null, false, null, limit).stream()
                        .filter(
                                event ->
                                        namesADocument(event)
                                                || event.scope() == FailureScope.SOURCE)
                        .toList();
        Map<Long, StoredFile> named = storedFilesNamedBy(events, viewer);
        return events.stream().map(event -> fromFailure(event, kinds, named, viewer)).toList();
    }

    /**
     * The stored files behind the reader's own rows, in one query for the page. Only a
     * storage-backed folder's identity resolves; a disk folder's is a path and stays unnamed.
     */
    private Map<Long, StoredFile> storedFilesNamedBy(
            List<FileRunEvent> events, FileRunEventService.Viewer viewer) {
        List<Long> ids =
                events.stream()
                        .filter(event -> fileRunEvents.ownershipOf(event, viewer) == Ownership.MINE)
                        .map(event -> StorageFileIdentities.storedFileIdOf(event.fileId()))
                        .filter(Objects::nonNull)
                        .distinct()
                        .toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return storedFiles.findAllById(ids).stream()
                .collect(Collectors.toMap(StoredFile::getId, file -> file));
    }

    /** What to call the document, for the row's own owner and nobody else. */
    private static String documentNameFor(
            FileRunEvent event, Ownership ownership, Map<Long, StoredFile> named) {
        if (ownership != Ownership.MINE || event.actor() == null) {
            return null;
        }
        Long storedFileId = StorageFileIdentities.storedFileIdOf(event.fileId());
        // Guarded rather than looked up: an immutable empty map refuses a null key.
        StoredFile file = storedFileId == null ? null : named.get(storedFileId);
        // Belt and braces over the ownership above: that says the reader raised the row, this says
        // the document is theirs. A row can outlive the file it named.
        if (file == null
                || file.getOwner() == null
                || !event.actor().equals(file.getOwner().getUsername())) {
            return null;
        }
        return file.getOriginalFilename();
    }

    private static boolean namesADocument(FileRunEvent event) {
        return event.fileId() != null && !event.fileId().isBlank();
    }

    /** Takes the prefixed id, so the bell cannot reach a failure endpoint even by accident. */
    public NotificationView resolve(String notificationId) {
        NotificationSource.QualifiedId qualified = qualify(notificationId);
        return switch (qualified.source()) {
            case FAILURE -> fromFailure(fileRunEvents.resolve(qualified.rowId()));
        };
    }

    /**
     * Run one of the row's own server actions, addressed by prefixed id. Nothing is authorised
     * here: the producing service re-checks the row and the action.
     */
    public NotificationView act(String notificationId, String actionId) {
        NotificationSource.QualifiedId qualified = qualify(notificationId);
        return switch (qualified.source()) {
            case FAILURE ->
                    fromFailure(fileRunEvents.dispatch(qualified.rowId(), actionId, Map.of()));
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

    /** One row on its own, looked up for itself. */
    private NotificationView fromFailure(FileRunEvent event) {
        FileRunEventService.Viewer viewer = fileRunEvents.viewer();
        return fromFailure(
                event, new HashMap<>(), storedFilesNamedBy(List.of(event), viewer), viewer);
    }

    /** Prefixes the row id on the way out, so it is never sent bare. */
    private NotificationView fromFailure(
            FileRunEvent event,
            Map<String, ProducingSurface> kinds,
            Map<Long, StoredFile> named,
            FileRunEventService.Viewer viewer) {
        ProducingSurface source = fileRunEvents.producingSurfaceOf(event, kinds);
        FileRunEventView.DocumentLocation location =
                FileRunEventView.DocumentLocation.of(event, source);
        boolean resolvableHere = location == FileRunEventView.DocumentLocation.BROWSER;
        // A smart folder's document, or the folder itself when it could not be read: the server
        // keeps these for the reader, and a member's bell shows them without a local file.
        boolean heldByServer =
                location == FileRunEventView.DocumentLocation.SMART_FOLDER
                        || (event.scope() == FailureScope.SOURCE
                                && source == ProducingSurface.SMART_FOLDER);
        Ownership ownership = fileRunEvents.ownershipOf(event, viewer);
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
                resolvableHere ? null : documentNameFor(event, ownership, named),
                location,
                heldByServer,
                event.sourceId(),
                event.policyId(),
                event.occurrences(),
                event.createdAt(),
                event.lastSeenAt(),
                bellActions(event, source, viewer));
    }

    /**
     * What the bell may offer: every fix, including the ones the server carries out, but not a
     * disposition, which is the review surface's to apply. A new disposition belongs in this list.
     */
    private List<FileRunEventView.ActionView> bellActions(
            FileRunEvent event, ProducingSurface source, FileRunEventService.Viewer viewer) {
        return fileRunEvents.availableActions(event, source, viewer).stream()
                .filter(
                        action ->
                                action.id() != FailureActionId.DISMISS
                                        && action.id() != FailureActionId.ACKNOWLEDGE)
                .map(FileRunEventView.ActionView::of)
                .toList();
    }
}
