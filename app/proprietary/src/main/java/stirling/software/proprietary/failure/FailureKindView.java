package stirling.software.proprietary.failure;

import java.util.List;

/**
 * Wire shape of one registry entry, served so a client can describe kinds it was not built with.
 * Also a feature probe: a build without the proprietary module has no such route, so a 404 means
 * there is no failure tracking here.
 */
public record FailureKindView(
        String id,
        FailureStage stage,
        FailureSeverity severity,
        FailureRemedy remedy,
        FailureScope scope,
        List<String> errorCodes,
        String titleKey,
        String descriptionKey,
        String defaultTitle,
        List<ActionDeclaration> actions) {

    public static FailureKindView of(FailureKind kind) {
        return new FailureKindView(
                kind.getId(),
                kind.getStage(),
                kind.getSeverity(),
                kind.getRemedy(),
                kind.getScope(),
                kind.getErrorCodes(),
                kind.getTitleKey(),
                kind.getDescriptionKey(),
                kind.getDefaultTitle(),
                kind.getActions().stream()
                        .map(
                                action ->
                                        new ActionDeclaration(
                                                action.name(), kind.labelKeyFor(action)))
                        .toList());
    }

    /** An action this kind offers, with the label key to render it by. */
    public record ActionDeclaration(String id, String labelKey) {}
}
