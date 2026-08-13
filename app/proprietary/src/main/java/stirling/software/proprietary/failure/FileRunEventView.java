package stirling.software.proprietary.failure;

import java.util.List;

/**
 * Wire shape of one incident. Carries i18n keys plus {@code defaultTitle} rather than rendered
 * copy, so the server can ship a new kind without a client release, and {@code actions} arrive
 * already resolved so the client needs no rules. No document name: {@code fileId} is an opaque
 * reference.
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
        String actor,
        int occurrences,
        FileRunEventStatus status,
        String statusActor,
        List<ActionView> actions,
        long createdAt,
        long lastSeenAt) {

    public static FileRunEventView of(
            FileRunEvent event, List<FileRunEventService.AvailableAction> actions) {
        FailureKind kind = event.kind();
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
                event.fileId(),
                event.actor(),
                event.occurrences(),
                event.status(),
                event.statusActor(),
                actions.stream().map(ActionView::of).toList(),
                event.createdAt() == null ? 0L : event.createdAt().toEpochMilli(),
                event.lastSeenAt() == null ? 0L : event.lastSeenAt().toEpochMilli());
    }

    /**
     * One button, as offered to this caller about this row. {@code defaultLabel} and {@code
     * execution} are here for the reason {@code defaultTitle} is on the row: a client can then
     * render, and route, an action it was never built with. Declaration order is display order.
     */
    public record ActionView(
            String id,
            String labelKey,
            String defaultLabel,
            FailureActionId.Execution execution,
            boolean enabled,
            String disabledReasonKey) {

        /** Public because the notification bell projects the same resolved offers. */
        public static ActionView of(FileRunEventService.AvailableAction action) {
            return new ActionView(
                    action.id().name(),
                    action.labelKey(),
                    action.id().getDefaultLabel(),
                    action.id().getExecution(),
                    action.enabled(),
                    action.disabledReasonKey());
        }
    }
}
