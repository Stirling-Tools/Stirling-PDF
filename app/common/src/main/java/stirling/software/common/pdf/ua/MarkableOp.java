package stirling.software.common.pdf.ua;

/**
 * One operator in a page content stream that may be wrapped in a marked-content sequence.
 *
 * <p>The {@code ordinal} is the operator's index within the page's own top-level operator sequence,
 * counting only markable operators. It is the join key between text extraction and token rewriting:
 * both passes walk the same stream and count the same operator names, so the ordinals agree by
 * construction.
 */
public record MarkableOp(int ordinal, Kind kind, BBox bbox, String resourceName) {

    public enum Kind {
        /** Tj, TJ, ' or " */
        TEXT,
        /** Do referencing an image XObject */
        IMAGE,
        /** Do referencing a form XObject */
        FORM,
        /** BI ... ID ... EI */
        INLINE_IMAGE,
        /** A path-painting or shading operator: rules, borders, fills, logos */
        VECTOR;

        public boolean isGraphic() {
            return this == IMAGE || this == INLINE_IMAGE;
        }
    }

    /**
     * Operator names counted as markable. Both passes must agree on this set.
     *
     * <p>Path painting belongs here: a rule under a heading or a table border is visible content,
     * so PDF/UA-1 clause 7.1 requires it to be either tagged or marked as an artifact. Leaving it
     * out was the single largest source of "content is neither tagged nor artifact" failures.
     */
    public static boolean isMarkableOperator(String name) {
        return switch (name) {
            case "Tj", "TJ", "'", "\"", "Do", "BI" -> true;
            default -> isPathPainting(name);
        };
    }

    /**
     * Painting operators only: {@code n} ends a path without marking the page, so it is excluded.
     */
    public static boolean isPathPainting(String name) {
        return switch (name) {
            case "S", "s", "f", "F", "f*", "B", "B*", "b", "b*", "sh" -> true;
            default -> false;
        };
    }
}
