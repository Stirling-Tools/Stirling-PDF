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
        /** Leave undescribed so validation fails honestly; a faked {@code /Alt} helps nobody. */
        REQUIRE_ALT,
        /** Treat every image as decoration and mark it as an artifact. */
        MARK_DECORATIVE
    }

    @Builder.Default private PdfUaProfile profile = PdfUaProfile.UA1;

    /** BCP-47 language tag for the document, for example {@code en-GB}. */
    private String language;

    private String title;

    /** Last resort when no title is given and none can be derived; pass the uploaded filename. */
    private String fallbackTitle;

    /** Embed any font the document references but does not carry, which clause 7.21 requires. */
    @Builder.Default private boolean embedFonts = true;

    /** Leave the PDF version alone; raising it would break PDF/A-1, defined on PDF 1.4. */
    @Builder.Default private boolean preservePdfVersion = false;

    @Builder.Default private ExistingTags existingTags = ExistingTags.AUTO;

    @Builder.Default private FigurePolicy figurePolicy = FigurePolicy.REQUIRE_ALT;

    /** Alternative descriptions supplied by the caller, keyed by "pageIndex:ordinal". */
    @Builder.Default private Map<String, String> altTextByFigure = Map.of();

    public String altTextFor(int pageIndex, int ordinal) {
        return altTextByFigure.get(pageIndex + ":" + ordinal);
    }
}
