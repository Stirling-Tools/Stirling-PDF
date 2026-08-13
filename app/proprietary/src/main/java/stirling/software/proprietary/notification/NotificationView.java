package stirling.software.proprietary.notification;

import java.time.Instant;
import java.util.List;

import stirling.software.proprietary.failure.FailureOrigin;
import stirling.software.proprietary.failure.FailureSeverity;
import stirling.software.proprietary.failure.FileRunEventStatus;
import stirling.software.proprietary.failure.FileRunEventView;
import stirling.software.proprietary.failure.Ownership;

/**
 * One thing worth telling the caller about, flattened to what a bell needs to render it and act on
 * it. Sources project onto this rather than exposing their own shape, so a client renders and
 * triages a notification without knowing which subsystem produced it.
 *
 * <p>The facets read as failure vocabulary because failures are the only source so far. A later
 * source projects onto the same fields or leaves them null; what a client must not do is infer the
 * source from which fields are populated, which is what {@code source} is for.
 *
 * @param id unique across every source, so a client can key and de-duplicate on it alone. Prefixed
 *     with its source, and the only handle the notification endpoints accept
 * @param source which subsystem produced it, for grouping and for the click-through
 * @param kindId the source's own id for what happened, so a client can group or route on it
 * @param origin what was running when it happened, e.g. one tool or a policy
 * @param ownership whether this is the caller's own to act on, derived per read
 * @param severity how loudly to show it
 * @param status where the underlying row stands, so a bell can show what has already been dealt
 *     with
 * @param titleKey i18n key for the headline, with {@code defaultTitle} as the English fallback
 * @param detail the one-line body, as the source recorded it
 * @param fileId opaque reference to the document, never a name. Two id spaces share it, and {@code
 *     sourceId} is what tells them apart; see {@code PolicyEngine#runPolicy}
 * @param sourceId which folder, bucket or webhook fed the failing run, and null for an attended run
 *     the caller started themselves
 * @param policyId which policy the failing run belonged to; null for work with no policy around it
 * @param occurrences how many times this same thing has happened, at least 1
 * @param createdAt when it first happened; the client orders and marks unread on this
 * @param lastSeenAt when it last happened, equal to {@code createdAt} for a one-off
 * @param actions the same resolved offers the failure surface renders, already filtered to this
 *     caller, so the bell needs no rules of its own
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
