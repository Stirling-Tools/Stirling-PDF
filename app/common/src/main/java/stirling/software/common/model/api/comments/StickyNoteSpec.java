package stirling.software.common.model.api.comments;

/**
 * Description of a single sticky-note (PDF Text) annotation to place on a document.
 *
 * <p>{@code author} and {@code subject} are optional — callers that pass {@code null} get a default
 * author/subject from {@code PdfAnnotationService}.
 *
 * @param location where to anchor the annotation icon, in PDF user-space.
 * @param text the comment body shown in the popup (required, non-blank).
 * @param author optional author label shown in the popup; {@code null} → service default.
 * @param subject optional subject line shown in the popup; {@code null} → service default.
 */
public record StickyNoteSpec(
        AnnotationLocation location, String text, String author, String subject) {}
