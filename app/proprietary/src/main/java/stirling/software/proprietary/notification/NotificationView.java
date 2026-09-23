package stirling.software.proprietary.notification;

import java.time.Instant;
import java.util.List;

import stirling.software.proprietary.failure.FailureOrigin;
import stirling.software.proprietary.failure.FailureSeverity;
import stirling.software.proprietary.failure.FileRunEventStatus;
import stirling.software.proprietary.failure.FileRunEventView;
import stirling.software.proprietary.failure.Ownership;
import stirling.software.proprietary.failure.SourceKind;

/**
 * A source's row flattened to what a bell renders. {@code fileId} is present only when {@code
 * documentLocation} is {@code BROWSER}; a document the server holds is named only for its owner.
 */
public record NotificationView(
        String id,
        NotificationSource source,
        String kindId,
        FailureOrigin origin,
        Ownership ownership,
        FailureSeverity severity,
        FileRunEventStatus status,
        String titleKey,
        String defaultTitle,
        String detail,
        String fileId,
        /**
         * What to call a document the reader cannot hold, for the person the row belongs to and
         * nobody else. Null unless a storage-backed folder can answer; never a path.
         */
        String documentName,
        FileRunEventView.DocumentLocation documentLocation,
        /**
         * Whether the server keeps this row on the reader's behalf: a smart folder's document, or
         * the folder itself when it could not be read. The one rule a member's bell filters on.
         */
        boolean heldByServer,
        /**
         * What fed the run, for a row the reader did not cause; {@code EDITOR} for one they did.
         */
        SourceKind sourceKind,
        String sourceId,
        String policyId,
        int occurrences,
        Instant createdAt,
        Instant lastSeenAt,
        List<FileRunEventView.ActionView> actions) {}
