package stirling.software.proprietary.notification;

import java.time.Instant;
import java.util.List;

import stirling.software.proprietary.failure.FailureOrigin;
import stirling.software.proprietary.failure.FailureSeverity;
import stirling.software.proprietary.failure.FileRunEventStatus;
import stirling.software.proprietary.failure.FileRunEventView;
import stirling.software.proprietary.failure.Ownership;

/**
 * A source's row flattened to what a bell renders. {@code fileId} is an opaque reference, never a
 * name, and two id spaces share it: {@code sourceId} tells them apart.
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
        String sourceId,
        String policyId,
        int occurrences,
        Instant createdAt,
        Instant lastSeenAt,
        List<FileRunEventView.ActionView> actions) {}
