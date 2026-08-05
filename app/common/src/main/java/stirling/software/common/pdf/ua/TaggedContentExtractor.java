package stirling.software.common.pdf.ua;

import java.io.IOException;
import java.io.Writer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFontDescriptor;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDTransparencyGroup;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.apache.pdfbox.util.Matrix;
import org.apache.pdfbox.util.Vector;

import lombok.extern.slf4j.Slf4j;

/**
 * Extracts text lines and graphic operations from page content streams, tagging each with the
 * ordinal of the operator that produced it.
 *
 * <p>Two passes run over the same operator sequence. The text pass ({@link PDFTextStripper}) yields
 * lines and glyph geometry; the token pass ({@link PDFStreamParser}) yields graphics and the
 * transformation matrices needed to place them. Both count the same operator names in the same
 * order, so ordinals from one pass address operators in the other.
 *
 * <p>The text pass does descend into form XObjects, but only operators in the page's own stream are
 * counted; glyphs drawn inside a form are attributed to the {@code Do} that invoked it. That is
 * what lets a form's text be tagged as prose without its inner operators shifting the ordinals.
 */
@Slf4j
public class TaggedContentExtractor {

    /** Glyph size below which a run is treated as noise rather than a line. */
    private static final float MIN_FONT_SIZE = 0.5f;

    public List<PageContent> extract(PDDocument document) throws IOException {
        LineCollector collector = new LineCollector();
        collector.setSortByPosition(true);
        collector.setStartPage(1);
        collector.setEndPage(document.getNumberOfPages());
        collector.writeText(document, Writer.nullWriter());

        List<PageContent> pages = new ArrayList<>(document.getNumberOfPages());
        for (int i = 0; i < document.getNumberOfPages(); i++) {
            PDPage page = document.getPage(i);
            List<MarkableOp> ops = collector.opsFor(i);
            List<TextLineInfo> lines = collector.linesFor(i);
            boolean dropped = false;
            if (ops.size() < maxOrdinal(lines) + 1) {
                // Ordinals cannot be trusted for this page, so dropping the lines makes it
                // untaggable rather than mis-tagged. The flag lets the caller refuse to declare
                // conformance over text it just hid.
                log.warn(
                        "Ordinal mismatch on page {} (ops={}, text={}); skipping page",
                        i,
                        ops.size(),
                        maxOrdinal(lines) + 1);
                dropped = !lines.isEmpty();
                lines = List.of();
            }
            pages.add(
                    new PageContent(
                            i,
                            lines,
                            ops,
                            ops.size(),
                            collector.preMarkedOn(i),
                            collector.textSemanticsOn(i),
                            dropped,
                            normalisedBox(page)));
        }
        return pages;
    }

    /**
     * The page box in the same space as the extracted line coordinates.
     *
     * <p>The text engine translates by the MediaBox origin and reports rotated pages in the rotated
     * frame, so the box the analyser compares against must be origin-zero with width and height
     * swapped for 90 and 270 degree rotations. Using the raw MediaBox here silently broke
     * running-head detection on offset-origin and rotated pages.
     */
    static BBox normalisedBox(PDPage page) {
        PDRectangle mediaBox = page.getMediaBox();
        boolean sideways = page.getRotation() % 180 != 0;
        float width = sideways ? mediaBox.getHeight() : mediaBox.getWidth();
        float height = sideways ? mediaBox.getWidth() : mediaBox.getHeight();
        return new BBox(0, 0, width, height);
    }

    /**
     * Counts images without running the text pass.
     *
     * <p>The full extraction runs {@link PDFTextStripper} over every page, which is by far the
     * expensive half. A report only needs to know how many figures exist, and the token scan alone
     * answers that.
     */
    public int countGraphics(PDDocument document) {
        int total = 0;
        for (int i = 0; i < document.getNumberOfPages(); i++) {
            try {
                PDResources resources = document.getPage(i).getResources();
                PDFStreamParser parser = new PDFStreamParser(document.getPage(i));
                List<COSBase> operands = new ArrayList<>();
                Object token;
                while ((token = parser.parseNextToken()) != null) {
                    if (!(token instanceof Operator operator)) {
                        operands.add((COSBase) token);
                        continue;
                    }
                    if (isGraphicOperator(operator.getName(), operands, resources)) {
                        total++;
                    }
                    operands.clear();
                }
            } catch (IOException e) {
                log.debug("Could not scan page {} for graphics: {}", i, e.getMessage());
            }
        }
        return total;
    }

    /** True for an inline image, or a Do that resolves to an image XObject. */
    private static boolean isGraphicOperator(
            String name, List<COSBase> operands, PDResources resources) {
        if ("BI".equals(name)) {
            return true;
        }
        if (!"Do".equals(name) || resources == null || operands.size() != 1) {
            return false;
        }
        if (!(operands.get(0) instanceof COSName resourceName)) {
            return false;
        }
        try {
            return resources.getXObject(resourceName) instanceof PDImageXObject;
        } catch (IOException e) {
            return false;
        }
    }

    private static int maxOrdinal(List<TextLineInfo> lines) {
        return lines.stream().mapToInt(TextLineInfo::endOrdinal).max().orElse(-1);
    }

    static BBox toBBox(PDRectangle rect) {
        return new BBox(
                rect.getLowerLeftX(),
                rect.getLowerLeftY(),
                rect.getUpperRightX(),
                rect.getUpperRightY());
    }

    // --- Operator classification -------------------------------------------

    /**
     * True when a marked-content sequence carries replacement or alternative text. Rebuilding drops
     * it, which changes what a reader extracts, so the caller warns rather than losing it silently.
     */
    private static boolean isPathConstruction(String name) {
        return switch (name) {
            case "m", "l", "c", "v", "y", "re" -> true;
            default -> false;
        };
    }

    private static boolean carriesTextSemantics(List<COSBase> operands) {
        for (COSBase operand : operands) {
            if (operand instanceof COSDictionary dictionary
                    && (dictionary.containsKey(COSName.getPDFName("ActualText"))
                            || dictionary.containsKey(COSName.getPDFName("Alt"))
                            || dictionary.containsKey(COSName.E))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Describes one markable operator, using the engine's own transformation matrix to place it.
     *
     * <p>Taking the matrix from the graphics state rather than tracking q/Q/cm by hand removes a
     * whole class of bug: the engine already handles nesting, form matrices and text-space
     * subtleties that a hand-rolled stack gets wrong.
     */
    private static MarkableOp classify(
            String name,
            List<COSBase> operands,
            PDResources resources,
            Matrix ctm,
            BBox pathBox,
            int ordinal) {

        if ("BI".equals(name)) {
            return new MarkableOp(ordinal, MarkableOp.Kind.INLINE_IMAGE, unitSquare(ctm), null);
        }
        if (MarkableOp.isPathPainting(name)) {
            return new MarkableOp(ordinal, MarkableOp.Kind.VECTOR, pathBox, null);
        }
        if (!"Do".equals(name)) {
            return new MarkableOp(ordinal, MarkableOp.Kind.TEXT, BBox.EMPTY, null);
        }
        COSName resourceName =
                operands.size() == 1 && operands.get(0) instanceof COSName n ? n : null;
        if (resourceName == null || resources == null) {
            return new MarkableOp(ordinal, MarkableOp.Kind.FORM, unitSquare(ctm), null);
        }
        try {
            PDXObject xobject = resources.getXObject(resourceName);
            if (xobject instanceof PDImageXObject) {
                return new MarkableOp(
                        ordinal, MarkableOp.Kind.IMAGE, unitSquare(ctm), resourceName.getName());
            }
            if (xobject instanceof PDFormXObject form) {
                return new MarkableOp(
                        ordinal, MarkableOp.Kind.FORM, formBox(form, ctm), resourceName.getName());
            }
        } catch (IOException e) {
            log.debug("Could not resolve XObject {}: {}", resourceName.getName(), e.getMessage());
        }
        return new MarkableOp(
                ordinal, MarkableOp.Kind.FORM, unitSquare(ctm), resourceName.getName());
    }

    /**
     * Extends the running path box with the points of one path-construction operator.
     *
     * <p>Without this every vector carried an empty box and was written off as decoration, which
     * made bar charts, pie charts and vector logos disappear from the structure tree while the
     * report cheerfully said no figure needed a description.
     */
    private static BBox extendPath(BBox current, String name, List<COSBase> operands, Matrix ctm) {
        int pairs =
                switch (name) {
                    case "m", "l" -> 1;
                    case "re" -> 2;
                    case "v", "y" -> 2;
                    case "c" -> 3;
                    default -> 0;
                };
        if (pairs == 0 || operands.size() < pairs * 2) {
            return current;
        }

        // Deliberately allocation-free. This runs for every path-construction operator on every
        // page, and the obvious version - build a point list, wrap each in a Vector, union a BBox
        // per point - cost about a third of the extraction budget on a chart-heavy document.
        float minX = current.isEmpty() ? Float.MAX_VALUE : current.x0();
        float minY = current.isEmpty() ? Float.MAX_VALUE : current.y0();
        float maxX = current.isEmpty() ? -Float.MAX_VALUE : current.x1();
        float maxY = current.isEmpty() ? -Float.MAX_VALUE : current.y1();

        for (int pair = 0; pair < pairs; pair++) {
            Float x = numberAt(operands, pair * 2);
            Float y = numberAt(operands, pair * 2 + 1);
            if (x == null || y == null) {
                continue;
            }
            float px = x;
            float py = y;
            // "re" gives origin plus size, so the second pair is a corner offset from the first.
            if ("re".equals(name) && pair == 1) {
                Float ox = numberAt(operands, 0);
                Float oy = numberAt(operands, 1);
                if (ox == null || oy == null) {
                    continue;
                }
                px = ox + x;
                py = oy + y;
            }
            float tx = ctm.getScaleX() * px + ctm.getShearX() * py + ctm.getTranslateX();
            float ty = ctm.getShearY() * px + ctm.getScaleY() * py + ctm.getTranslateY();
            minX = Math.min(minX, tx);
            minY = Math.min(minY, ty);
            maxX = Math.max(maxX, tx);
            maxY = Math.max(maxY, ty);
        }
        return maxX < minX ? current : new BBox(minX, minY, maxX, maxY);
    }

    private static Float numberAt(List<COSBase> operands, int index) {
        return index < operands.size()
                        && operands.get(index) instanceof org.apache.pdfbox.cos.COSNumber number
                ? number.floatValue()
                : null;
    }

    /** The unit square mapped through the CTM, which is how images are placed. */
    private static BBox unitSquare(Matrix ctm) {
        return transformBox(new BBox(0, 0, 1, 1), ctm);
    }

    private static BBox formBox(PDFormXObject form, Matrix ctm) {
        PDRectangle box = form.getBBox();
        if (box == null) {
            return unitSquare(ctm);
        }
        Matrix combined = form.getMatrix() != null ? form.getMatrix().multiply(ctm) : ctm;
        return transformBox(toBBox(box), combined);
    }

    private static BBox transformBox(BBox box, Matrix m) {
        float[] xs = new float[4];
        float[] ys = new float[4];
        float[][] corners = {
            {box.x0(), box.y0()}, {box.x1(), box.y0()},
            {box.x0(), box.y1()}, {box.x1(), box.y1()}
        };
        for (int i = 0; i < 4; i++) {
            Vector v = m.transform(new Vector(corners[i][0], corners[i][1]));
            xs[i] = v.getX();
            ys[i] = v.getY();
        }
        float minX = Math.min(Math.min(xs[0], xs[1]), Math.min(xs[2], xs[3]));
        float maxX = Math.max(Math.max(xs[0], xs[1]), Math.max(xs[2], xs[3]));
        float minY = Math.min(Math.min(ys[0], ys[1]), Math.min(ys[2], ys[3]));
        float maxY = Math.max(Math.max(ys[0], ys[1]), Math.max(ys[2], ys[3]));
        return new BBox(minX, minY, maxX, maxY);
    }

    // --- Text pass ---------------------------------------------------------

    /** Marker recorded for each glyph so a finished line knows where it came from. */
    private record GlyphOrigin(int ordinal, boolean marked) {}

    private static final class LineCollector extends PDFTextStripper {

        private final Map<Integer, List<TextLineInfo>> byPage = new HashMap<>();
        private final Map<Integer, List<MarkableOp>> opsByPage = new HashMap<>();
        private final Map<Integer, Boolean> preMarkedByPage = new HashMap<>();
        private final Map<Integer, Boolean> textSemanticsByPage = new HashMap<>();
        private final Map<TextPosition, GlyphOrigin> origins = new IdentityHashMap<>();
        private final List<TextPosition> lineBuffer = new ArrayList<>();
        private final List<WordInfo> lineWords = new ArrayList<>();
        private final StringBuilder lineText = new StringBuilder();

        private int ordinal = -1;
        private int markedDepth;
        private int nestedDepth;
        private BBox pathBox = BBox.EMPTY;
        private int syntheticDepth;
        private float pageHeight;
        private int pageIndex;

        LineCollector() throws IOException {
            super();
        }

        List<TextLineInfo> linesFor(int index) {
            return byPage.getOrDefault(index, List.of());
        }

        List<MarkableOp> opsFor(int index) {
            return opsByPage.getOrDefault(index, List.of());
        }

        boolean preMarkedOn(int index) {
            return preMarkedByPage.getOrDefault(index, false);
        }

        boolean textSemanticsOn(int index) {
            return textSemanticsByPage.getOrDefault(index, false);
        }

        @Override
        protected void startPage(PDPage page) throws IOException {
            ordinal = -1;
            markedDepth = 0;
            nestedDepth = 0;
            syntheticDepth = 0;
            pathBox = BBox.EMPTY;
            origins.clear();
            lineBuffer.clear();
            lineWords.clear();
            lineText.setLength(0);
            // Dir-adjusted glyph coordinates live in the rotated frame, so the flip must too.
            pageHeight = normalisedBox(page).height();
            pageIndex = getCurrentPageNo() - 1;
            super.startPage(page);
        }

        @Override
        protected void endPage(PDPage page) throws IOException {
            flushLine();
            super.endPage(page);
        }

        /**
         * Counts only operators that are physically present in the page's own stream.
         *
         * <p>Two things would otherwise inflate the count and break the join with the token pass.
         * PDFBox implements {@code '} and {@code "} by re-entering {@code processOperator} with
         * synthetic {@code T*}, {@code Tj}, {@code Tw} and {@code Tc} calls, and the engine
         * descends into form XObjects, whose operators never appear in the page stream at all.
         * Content inside a nested stream is attributed to the operator that invoked it, which is
         * what lets a form be tagged as a single region.
         */
        @Override
        protected void processOperator(Operator operator, List<COSBase> operands)
                throws IOException {
            String name = operator.getName();
            if (nestedDepth == 0 && syntheticDepth == 0) {
                if (isPathConstruction(name)) {
                    pathBox =
                            extendPath(
                                    pathBox,
                                    name,
                                    operands,
                                    getGraphicsState().getCurrentTransformationMatrix());
                }
                if (MarkableOp.isMarkableOperator(name)) {
                    ordinal++;
                    // Classified here rather than in a second parse of the same stream: the engine
                    // already has the operands and the live transformation matrix.
                    opsByPage
                            .computeIfAbsent(pageIndex, k -> new ArrayList<>())
                            .add(
                                    classify(
                                            name,
                                            operands,
                                            getResources(),
                                            getGraphicsState().getCurrentTransformationMatrix(),
                                            pathBox,
                                            ordinal));
                    if (MarkableOp.isPathPainting(name)) {
                        pathBox = BBox.EMPTY;
                    }
                } else if ("n".equals(name)) {
                    pathBox = BBox.EMPTY;
                } else if ("BDC".equals(name) || "BMC".equals(name)) {
                    markedDepth++;
                    preMarkedByPage.put(pageIndex, true);
                    if (carriesTextSemantics(operands)) {
                        textSemanticsByPage.put(pageIndex, true);
                    }
                } else if ("EMC".equals(name) && markedDepth > 0) {
                    markedDepth--;
                }
            }
            boolean synthesises = "'".equals(name) || "\"".equals(name);
            if (synthesises) {
                syntheticDepth++;
            }
            try {
                super.processOperator(operator, operands);
            } finally {
                if (synthesises) {
                    syntheticDepth--;
                }
            }
        }

        @Override
        public void showForm(PDFormXObject form) throws IOException {
            nestedDepth++;
            try {
                super.showForm(form);
            } finally {
                nestedDepth--;
            }
        }

        @Override
        public void showTransparencyGroup(PDTransparencyGroup group) throws IOException {
            nestedDepth++;
            try {
                super.showTransparencyGroup(group);
            } finally {
                nestedDepth--;
            }
        }

        @Override
        protected void showType3Glyph(
                Matrix textRenderingMatrix,
                PDType3Font font,
                int code,
                org.apache.pdfbox.util.Vector displacement)
                throws IOException {
            nestedDepth++;
            try {
                super.showType3Glyph(textRenderingMatrix, font, code, displacement);
            } finally {
                nestedDepth--;
            }
        }

        @Override
        protected void processChildStream(
                org.apache.pdfbox.contentstream.PDContentStream contentStream, PDPage page)
                throws IOException {
            nestedDepth++;
            try {
                super.processChildStream(contentStream, page);
            } finally {
                nestedDepth--;
            }
        }

        @Override
        protected void processTextPosition(TextPosition text) {
            origins.put(text, new GlyphOrigin(ordinal, markedDepth > 0));
            super.processTextPosition(text);
        }

        @Override
        protected void writeString(String text, List<TextPosition> positions) {
            lineText.append(text);
            lineBuffer.addAll(positions);
            WordInfo word = buildWord(text, positions);
            if (word != null) {
                lineWords.add(word);
            }
        }

        private WordInfo buildWord(String text, List<TextPosition> positions) {
            if (text == null || text.isBlank() || positions.isEmpty()) {
                return null;
            }
            Bounds bounds = new Bounds();
            for (TextPosition tp : positions) {
                bounds.accept(tp, pageHeight, origins.get(tp));
            }
            if (bounds.end < 0) {
                return null;
            }
            return new WordInfo(
                    text,
                    bounds.box(),
                    bounds.start,
                    bounds.end,
                    bounds.dominantSize(),
                    bounds.bold);
        }

        @Override
        protected void writeWordSeparator() {
            lineText.append(' ');
        }

        @Override
        protected void writeLineSeparator() {
            flushLine();
        }

        @Override
        protected void writeParagraphSeparator() {
            flushLine();
        }

        private void flushLine() {
            if (lineBuffer.isEmpty()) {
                lineText.setLength(0);
                lineWords.clear();
                return;
            }
            TextLineInfo line = buildLine();
            lineBuffer.clear();
            lineWords.clear();
            lineText.setLength(0);
            if (line != null) {
                byPage.computeIfAbsent(pageIndex, k -> new ArrayList<>()).add(line);
            }
        }

        private TextLineInfo buildLine() {
            String text = lineText.toString();
            if (text.isBlank()) {
                return null;
            }
            Bounds bounds = new Bounds();
            for (TextPosition tp : lineBuffer) {
                bounds.accept(tp, pageHeight, origins.get(tp));
            }
            if (bounds.end < 0) {
                return null;
            }
            return new TextLineInfo(
                    pageIndex,
                    text,
                    bounds.box(),
                    bounds.dominantSize(),
                    bounds.bold,
                    bounds.start,
                    bounds.end,
                    bounds.marked,
                    List.copyOf(lineWords));
        }
    }

    /** Accumulates glyph geometry, ordinals and font signals for a word or a line. */
    private static final class Bounds {
        private float minX = Float.MAX_VALUE;
        private float maxX = -Float.MAX_VALUE;
        private float minY = Float.MAX_VALUE;
        private float maxY = -Float.MAX_VALUE;
        private int start = Integer.MAX_VALUE;
        private int end = -1;
        private boolean marked;
        private boolean bold;
        private final Map<Float, Integer> sizeCounts = new HashMap<>();

        void accept(TextPosition tp, float pageHeight, GlyphOrigin origin) {
            float top = pageHeight - tp.getYDirAdj();
            float bottom = top - Math.max(tp.getHeightDir(), 0);
            minX = Math.min(minX, tp.getXDirAdj());
            maxX = Math.max(maxX, tp.getXDirAdj() + tp.getWidthDirAdj());
            minY = Math.min(minY, bottom);
            maxY = Math.max(maxY, top);

            if (origin != null) {
                start = Math.min(start, origin.ordinal());
                end = Math.max(end, origin.ordinal());
                marked |= origin.marked();
            }
            float size = tp.getFontSizeInPt();
            if (size > MIN_FONT_SIZE) {
                sizeCounts.merge(round(size), 1, Integer::sum);
            }
            bold |= isBold(tp);
        }

        BBox box() {
            return new BBox(minX, minY, maxX, maxY);
        }

        float dominantSize() {
            return sizeCounts.entrySet().stream()
                    .max(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey)
                    .orElse(0f);
        }

        private static float round(float value) {
            return Math.round(value * 10f) / 10f;
        }

        private static boolean isBold(TextPosition tp) {
            if (tp.getFont() == null) {
                return false;
            }
            String name = tp.getFont().getName();
            if (name != null && name.toLowerCase().contains("bold")) {
                return true;
            }
            PDFontDescriptor descriptor = tp.getFont().getFontDescriptor();
            return descriptor != null
                    && (descriptor.getFontWeight() >= 600 || descriptor.isForceBold());
        }
    }
}
