package stirling.software.proprietary.pdf.ua;

import java.util.List;

/**
 * Everything the layout analyser needs about one page. carriesTextSemantics: existing marked
 * content has ActualText/Alt/expansion a rebuild would discard. linesDropped: text became
 * artifacts.
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
