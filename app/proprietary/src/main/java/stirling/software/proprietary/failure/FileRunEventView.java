package stirling.software.proprietary.failure;

import java.util.List;

/**
 * Wire shape of one incident. Carries i18n keys plus {@code defaultTitle} rather than rendered
 * copy, so the server can ship a new kind without a client release, and {@code actions} arrive
 * already resolved so the client needs no rules.
 *
 * <p>A source-fed row carries no {@code fileId}: the identity behind it is a path on the operator's
 * disk, and the client has nothing to resolve it against anyway. See {@link #documentLocation}.
 */
public record FileRunEventView(
        String id,
        String kindId,
        FailureStage stage,
        FailureSeverity severity,
        FailureScope scope,
        FailureOrigin origin,
        FailureRemedy remedy,
        String titleKey,
        String descriptionKey,
        String defaultTitle,
        String detail,
        String policyId,
        String runId,
        String sourceId,
        String fileId,
        /** Where the document is, so the client stops inferring it from {@code sourceId}. */
        DocumentLocation documentLocation,
        String actor,
        int occurrences,
        FileRunEventStatus status,
        String statusActor,
        List<ActionView> actions,
        long createdAt,
        long lastSeenAt) {

    /** Where the document behind an incident lives, which decides what can be offered for it. */
    public enum DocumentLocation {
        /** The reader's own browser minted the id, so client-side fixes can find it. */
        BROWSER,
        /** A folder the server watches. Only the server can reach it, and only for its owner. */
        SMART_FOLDER,
        /** The row is about no document, or one nothing here can address. */
        NONE;

        /**
         * A row with no source was reported by a client, which is the only producer whose file ids
         * that client can resolve. Everything else was fed by a source the server owns.
         */
        public static DocumentLocation of(FileRunEvent event) {
            if (event.fileId() == null || event.fileId().isBlank()) {
                return NONE;
            }
            return event.sourceId() == null || event.sourceId().isBlank() ? BROWSER : SMART_FOLDER;
        }
    }

    public static FileRunEventView of(
            FileRunEvent event, List<FileRunEventService.AvailableAction> actions) {
        FailureKind kind = event.kind();
        DocumentLocation location = DocumentLocation.of(event);
        return new FileRunEventView(
                event.id(),
                kind.getId(),
                event.stage(),
                event.severity(),
                event.scope(),
                event.origin(),
                kind.getRemedy(),
                kind.getTitleKey(),
                kind.getDescriptionKey(),
                kind.getDefaultTitle(),
                event.detail(),
                event.policyId(),
                event.runId(),
                event.sourceId(),
                // Withheld for anything the client cannot resolve, so a disk path never leaves the
                // server even to a reader entitled to the row.
                location == DocumentLocation.BROWSER ? event.fileId() : null,
                location,
                event.actor(),
                event.occurrences(),
                event.status(),
                event.statusActor(),
                actions.stream().map(ActionView::of).toList(),
                event.createdAt() == null ? 0L : event.createdAt().toEpochMilli(),
                event.lastSeenAt() == null ? 0L : event.lastSeenAt().toEpochMilli());
    }

    /**
     * {@code defaultLabel} and {@code execution} let a client render an action it was never built
     * with; {@code slot} is placement intent. See {@link FailureActionSlot}.
     */
    public record ActionView(
            String id,
            String labelKey,
            String defaultLabel,
            FailureActionId.Execution execution,
            FailureActionSlot slot,
            boolean enabled,
            String disabledReasonKey) {

        public static ActionView of(FileRunEventService.AvailableAction action) {
            return new ActionView(
                    action.id().name(),
                    action.labelKey(),
                    action.id().getDefaultLabel(),
                    action.id().getExecution(),
                    action.slot(),
                    action.enabled(),
                    action.disabledReasonKey());
        }
    }
}
