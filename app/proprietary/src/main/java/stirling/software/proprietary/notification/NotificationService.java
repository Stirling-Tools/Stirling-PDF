package stirling.software.proprietary.notification;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

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
     * Newest first, and only open failures with something to tell the reader: about a document, or
     * about a source that could not be read at all. One already dealt with is not news, and a row
     * naming no file has nothing the bell can offer beyond saying so.
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
        List<FileRunEvent> events =
                fileRunEvents.list(null, false, null, limit).stream()
                        .filter(
                                event ->
                                        namesADocument(event)
                                                || event.scope() == FailureScope.SOURCE)
                        .toList();
        Map<Long, StoredFile> named = namedDocumentsIn(events);
        return events.stream().map(event -> fromFailure(event, kinds, named)).toList();
    }

    /**
     * The stored rows this page might name, read in one query rather than one per polled row. Only
     * rows the reader raised are fetched: {@link #documentNameFor} answers for no others.
     */
    private Map<Long, StoredFile> namedDocumentsIn(List<FileRunEvent> events) {
        Set<Long> ids =
                events.stream()
                        .filter(event -> fileRunEvents.ownershipOf(event) == Ownership.MINE)
                        .map(event -> StorageFileIdentities.storedFileIdOf(event.fileId()))
                        .filter(Objects::nonNull)
                        .collect(Collectors.toSet());
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<Long, StoredFile> byId = new HashMap<>();
        storedFiles.findAllById(ids).forEach(file -> byId.put(file.getId(), file));
        return byId;
    }

    /**
     * What to call the document, for the one reader entitled to know: the person the row belongs
     * to, looking at a file they own.
     *
     * <p>Derived, never stored, and never sent to anyone else — a colleague's filename is not a
     * team leader's to read. Only a storage-backed folder can answer at all: its identity is the
     * stored row's id, so the name comes from the row. A disk folder's identity is a path, and
     * returning the last segment of it would be the same disclosure by another route.
     */
    private String documentNameFor(
            FileRunEvent event, Ownership ownership, Map<Long, StoredFile> named) {
        if (ownership != Ownership.MINE || event.actor() == null) {
            return null;
        }
        Long storedFileId = StorageFileIdentities.storedFileIdOf(event.fileId());
        if (storedFileId == null) {
            return null;
        }
        return Optional.ofNullable(named.get(storedFileId))
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
            case FAILURE -> fromFailure(fileRunEvents.resolve(qualified.rowId()));
        };
    }

    /**
     * Run one of the row's own server actions, addressed the way the bell holds it. The prefix is
     * the whole reason this exists rather than the bell calling the failure endpoint directly.
     *
     * <p>Nothing is decided here: the producing service re-checks that the caller may see the row
     * and that its kind declares the action, and each action authorises its own effects.
     */
    public NotificationView act(
            String notificationId, String actionId, Map<String, String> inputs) {
        NotificationSource.QualifiedId qualified = qualify(notificationId);
        return switch (qualified.source()) {
            case FAILURE ->
                    fromFailure(fileRunEvents.dispatch(qualified.rowId(), actionId, inputs));
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

    /** One row on its own, where a batch would be the same query it already makes. */
    private NotificationView fromFailure(FileRunEvent event) {
        return fromFailure(event, new HashMap<>(), namedDocumentsIn(List.of(event)));
    }

    /** Prefixes the row id on the way out, so it is never sent bare. */
    private NotificationView fromFailure(
            FileRunEvent event, Map<String, SourceKind> kinds, Map<Long, StoredFile> named) {
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
                resolvableHere ? null : documentNameFor(event, ownership, named),
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
