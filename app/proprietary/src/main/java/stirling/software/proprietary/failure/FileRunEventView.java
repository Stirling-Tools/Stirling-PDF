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
