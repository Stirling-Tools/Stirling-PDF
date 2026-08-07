package stirling.software.common.pdf.ua;

/**
 * One operator in a page content stream that may be wrapped in a marked-content sequence. The
 * ordinal counts only markable operators, joining text extraction to token rewriting.
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
     * Operator names counted as markable; both passes must agree on this set. Path painting is
     * included because clause 7.1 needs visible rules and borders tagged or artifacted.
     */
    public static boolean isMarkableOperator(String name) {
        return switch (name) {
            case "Tj", "TJ", "'", "\"", "Do", "BI" -> true;
            default -> isPathPainting(name);
        };
    }

    /** Painting operators only: {@code n} ends a path without marking the page. */
    public static boolean isPathPainting(String name) {
        return switch (name) {
            case "S", "s", "f", "F", "f*", "B", "B*", "b", "b*", "sh" -> true;
            default -> false;
        };
    }
}
