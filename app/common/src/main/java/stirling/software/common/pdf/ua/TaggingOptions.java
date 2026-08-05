package stirling.software.common.pdf.ua;

import java.util.Map;

import lombok.Builder;
import lombok.Getter;

/** Inputs that change how a document is tagged. */
@Getter
@Builder(toBuilder = true)
public class TaggingOptions {

    /** What to do when the source already has a structure tree. */
    public enum ExistingTags {
        /** Leave the tree alone and fix only document-level requirements. */
        KEEP,
        /** Discard the tree and derive a new one. */
        REBUILD,
        /** Keep a usable tree, rebuild an empty or trivially broken one. */
        AUTO
    }

    /** How images with no alternative description are handled. */
    public enum FigurePolicy {
        /**
         * Leave them undescribed so validation fails honestly and the report asks for input. Faking
         * an {@code /Alt} would pass the checker while telling a screen-reader user nothing.
         */
        REQUIRE_ALT,
        /** Treat every image as decoration and mark it as an artifact. */
        MARK_DECORATIVE
    }

    @Builder.Default private PdfUaProfile profile = PdfUaProfile.UA1;

    /** BCP-47 language tag for the document, for example {@code en-GB}. */
    private String language;

    private String title;

    /**
     * Used when no title is given and none can be derived from a heading. PDF/UA requires a title,
     * so callers should pass something meaningful such as the uploaded filename.
     */
    private String fallbackTitle;

    /** Embed any font the document references but does not carry, which clause 7.21 requires. */
    @Builder.Default private boolean embedFonts = true;

    /**
     * Leave the PDF version alone.
     *
     * <p>PDF/A-1 is defined on PDF 1.4, so raising the version to suit a PDF/UA profile would break
     * the archival conformance the caller actually asked for.
     */
    @Builder.Default private boolean preservePdfVersion = false;

    @Builder.Default private ExistingTags existingTags = ExistingTags.AUTO;

    @Builder.Default private FigurePolicy figurePolicy = FigurePolicy.REQUIRE_ALT;

    /** Alternative descriptions supplied by the caller, keyed by "pageIndex:ordinal". */
    @Builder.Default private Map<String, String> altTextByFigure = Map.of();

    public String altTextFor(int pageIndex, int ordinal) {
        return altTextByFigure.get(pageIndex + ":" + ordinal);
    }
}
