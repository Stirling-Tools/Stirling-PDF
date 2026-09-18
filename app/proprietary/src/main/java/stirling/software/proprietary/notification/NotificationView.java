package stirling.software.proprietary.notification;

import java.time.Instant;
import java.util.List;

import stirling.software.proprietary.failure.FailureOrigin;
import stirling.software.proprietary.failure.FailureSeverity;
import stirling.software.proprietary.failure.FileRunEventStatus;
import stirling.software.proprietary.failure.FileRunEventView;
import stirling.software.proprietary.failure.Ownership;

/**
 * A source's row flattened to what a bell renders. {@code fileId} is an opaque reference the
 * reader's own client minted, and is present only when {@code documentLocation} is {@code BROWSER}:
 * a document the server holds is described by its kind alone, never named or addressed.
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
        FileRunEventView.DocumentLocation documentLocation,
        /** What fed the run, for a row the reader did not cause. Null for an editor report. */
        SourceKind sourceKind,
        String sourceId,
        String policyId,
        int occurrences,
        Instant createdAt,
        Instant lastSeenAt,
        List<FileRunEventView.ActionView> actions) {}
