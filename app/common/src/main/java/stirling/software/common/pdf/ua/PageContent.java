package stirling.software.common.pdf.ua;

import java.util.List;

/**
 * Everything the layout analyser needs about one page.
 *
 * @param markableCount number of markable operators in the page's own content stream
 * @param preExistingMarkedContent true when the source stream already contained BDC/BMC
 * @param carriesTextSemantics true when existing marked content supplies ActualText, Alt or an
 *     expansion, all of which a rebuild discards
 * @param linesDropped true when the page had text but its lines were discarded because the two
 *     extraction passes disagreed; tagging would wrap that text as artifacts
 */
public record PageContent(
        int pageIndex,
        List<TextLineInfo> lines,
        List<MarkableOp> ops,
        int markableCount,
        boolean preExistingMarkedContent,
        boolean carriesTextSemantics,
        boolean linesDropped,
        BBox mediaBox) {

    public boolean hasText() {
        return lines.stream().anyMatch(line -> !line.isBlank());
    }

    /** Markable operators that draw graphics rather than text. */
    public List<MarkableOp> graphics() {
        return ops.stream().filter(op -> op.kind().isGraphic()).toList();
    }

    /** Form XObject invocations, which are tagged as a unit because their text is opaque here. */
    public List<MarkableOp> forms() {
        return ops.stream().filter(op -> op.kind() == MarkableOp.Kind.FORM).toList();
    }
}
