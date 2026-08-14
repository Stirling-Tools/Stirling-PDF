package stirling.software.proprietary.pdf.ua;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import lombok.extern.slf4j.Slf4j;

/**
 * Derives a logical structure from extracted lines and graphics, reusing {@code HeadingDetector}'s
 * heuristics. Degrades to paragraphs rather than guessing, since a wrong tag misleads readers.
 */
@Slf4j
public class LayoutAnalyzer {

    private static final Pattern BULLET = Pattern.compile("^[•‣◦⁃∙·▪●■o\\-\\*\\+]\\s+.*");
    private static final Pattern ORDERED =
            Pattern.compile("^(\\d{1,3}|[a-zA-Z]|[ivxlcIVXLC]{1,5})[\\.\\)]\\s+.*");
    private static final Pattern PAGE_NUMBER =
            Pattern.compile(
                    "^(page\\s+)?\\d{1,4}(\\s*(of|/)\\s*\\d{1,4})?$", Pattern.CASE_INSENSITIVE);
    private static final Pattern DIGITS = Pattern.compile("\\d+");

    /** Fraction of page height treated as the running head / foot band. */
    private static final float MARGIN_BAND = 0.10f;

    /** A line must exceed the body size by this ratio before it can be a heading. */
    private static final float HEADING_RATIO = 1.10f;

    /** Sizes within this many points are treated as the same heading tier. */
    private static final float TIER_TOLERANCE = 0.4f;

    private static final int MAX_HEADING_WORDS = 12;

    /** Word gap beyond this multiple of the font size separates table cells. */
    private static final float CELL_GAP_RATIO = 1.2f;

    /** Images smaller than this in either dimension are decoration, not content. */
    private static final float MIN_FIGURE_SIZE = 12f;

    /** A size used by more than this share of lines is body text, however large the median says. */
    private static final float MAX_HEADING_LINE_SHARE = 0.2f;

    /** Consecutive lines sharing a size are a text block; headings appear alone. */
    private static final int MAX_HEADING_RUN = 3;

    /** A vector thinner than this in either dimension is a rule or border, not a drawing. */
    private static final float MIN_VECTOR_THICKNESS = 3f;

    /** Vector clusters smaller than this are ornament; larger ones are probably a chart. */
    private static final float MIN_VECTOR_FIGURE_SIZE = 40f;

    /** A drawing is built from several strokes; one big rectangle is a panel, not a chart. */
    private static final int MIN_VECTOR_FIGURE_OPS = 4;

    /** More text than this inside the region means shading behind content, not a drawing. */
    private static final int MAX_LINES_INSIDE_FIGURE = 2;

    public DocumentStructure analyse(List<PageContent> pages) {
        DocumentStructure structure = new DocumentStructure();
        float bodySize = bodyFontSize(pages);
        structure.setBodyFontSize(bodySize);
        Map<Float, Integer> tiers = headingTiers(pages, bodySize);
        Map<Integer, List<TextLineInfo>> artifactLines = repeatedMarginLines(pages, bodySize);

        for (PageContent page : pages) {
            analysePage(
                    page,
                    structure,
                    bodySize,
                    tiers,
                    artifactLines.getOrDefault(page.pageIndex(), List.of()));
        }

        List<Integer> suppressedPages =
                pages.stream()
                        .filter(PageContent::linesDropped)
                        .map(PageContent::pageIndex)
                        .toList();
        if (!suppressedPages.isEmpty()) {
            structure.setTextSuppressed(true);
            structure.warn(
                    "Text on page(s) "
                            + suppressedPages.stream()
                                    .map(i -> String.valueOf(i + 1))
                                    .reduce((a, b) -> a + ", " + b)
                                    .orElse("")
                            + " could not be tagged reliably and was marked as artifacts. The"
                            + " converter will not claim conformance while real text is hidden"
                            + " from assistive technology.");
        }

        normaliseHeadingLevels(structure);
        structure.setTitle(deriveTitle(structure));
        return structure;
    }

    // --- Document-wide statistics -----------------------------------------

    /** Character-weighted median line size, which is far more stable than a plain median. */
    static float bodyFontSize(List<PageContent> pages) {
        Map<Float, Integer> weights = new HashMap<>();
        for (PageContent page : pages) {
            for (TextLineInfo line : page.lines()) {
                if (line.dominantFontSize() > 0 && !line.isBlank()) {
                    weights.merge(line.dominantFontSize(), line.charCount(), Integer::sum);
                }
            }
        }
        if (weights.isEmpty()) {
            return 0f;
        }
        int total = weights.values().stream().mapToInt(Integer::intValue).sum();
        List<Map.Entry<Float, Integer>> sorted =
                weights.entrySet().stream().sorted(Map.Entry.comparingByKey()).toList();
        int seen = 0;
        for (Map.Entry<Float, Integer> entry : sorted) {
            seen += entry.getValue();
            if (seen >= total / 2) {
                return entry.getKey();
            }
        }
        return sorted.get(sorted.size() - 1).getKey();
    }

    /** Maps each distinct heading size to a 1-based level, largest size first. */
    static Map<Float, Integer> headingTiers(List<PageContent> pages, float bodySize) {
        if (bodySize <= 0) {
            return Map.of();
        }
        // A size used by a large share of the lines is body text, whatever the median says.
        Map<Float, Integer> lineCounts = new HashMap<>();
        int totalLines = 0;
        for (PageContent page : pages) {
            for (TextLineInfo line : page.lines()) {
                if (!line.isBlank()) {
                    lineCounts.merge(line.dominantFontSize(), 1, Integer::sum);
                    totalLines++;
                }
            }
        }
        int headingLineCeiling = Math.max(1, (int) (totalLines * MAX_HEADING_LINE_SHARE));

        // Headings do not cluster; a run of same-size lines is a text block, not headings.
        Map<Float, Integer> longestRun = new HashMap<>();
        for (PageContent page : pages) {
            Float runSize = null;
            int runLength = 0;
            for (TextLineInfo line : page.lines()) {
                if (line.isBlank()) {
                    continue;
                }
                float size = line.dominantFontSize();
                if (runSize != null && Float.compare(size, runSize) == 0) {
                    runLength++;
                } else {
                    runSize = size;
                    runLength = 1;
                }
                int seen = longestRun.getOrDefault(size, 0);
                if (runLength > seen) {
                    longestRun.put(size, runLength);
                }
            }
        }

        List<Float> sizes = new ArrayList<>();
        for (PageContent page : pages) {
            for (TextLineInfo line : page.lines()) {
                if (isHeadingCandidate(line)
                        && line.dominantFontSize() > bodySize * HEADING_RATIO
                        && lineCounts.getOrDefault(line.dominantFontSize(), 0) <= headingLineCeiling
                        && longestRun.getOrDefault(line.dominantFontSize(), 0) < MAX_HEADING_RUN) {
                    sizes.add(line.dominantFontSize());
                }
            }
        }
        List<Float> distinct = sizes.stream().distinct().sorted(Comparator.reverseOrder()).toList();

        Map<Float, Integer> tiers = new LinkedHashMap<>();
        int level = 0;
        Float previous = null;
        for (Float size : distinct) {
            if (previous == null || previous - size > TIER_TOLERANCE) {
                level = Math.min(level + 1, 6);
                previous = size;
            }
            tiers.put(size, level);
        }
        return tiers;
    }

    /**
     * Claims a line's operators word run by word run; claiming the whole ordinal interval would
     * swallow anything drawn between them, an image included.
     */
    private static void claimLine(StructBlock block, TextLineInfo line) {
        // Sort by ordinal, not position: merging out-of-order runs silently drops them to
        // /Artifact, hiding them from assistive technology while the file still validates.
        List<WordInfo> words =
                line.words().stream()
                        .filter(w -> !w.isBlank())
                        .sorted(Comparator.comparingInt(WordInfo::startOrdinal))
                        .toList();
        if (words.isEmpty()) {
            block.addRange(line.startOrdinal(), line.endOrdinal());
            return;
        }
        int start = words.get(0).startOrdinal();
        int end = words.get(0).endOrdinal();
        for (int i = 1; i < words.size(); i++) {
            WordInfo word = words.get(i);
            if (word.startOrdinal() <= end + 1) {
                end = Math.max(end, word.endOrdinal());
            } else {
                block.addRange(start, end);
                start = word.startOrdinal();
                end = word.endOrdinal();
            }
        }
        block.addRange(start, end);
    }

    static boolean isHeadingCandidate(TextLineInfo line) {
        String text = line.text().strip();
        if (text.isEmpty() || line.wordCount() > MAX_HEADING_WORDS) {
            return false;
        }
        char last = text.charAt(text.length() - 1);
        return last != '.' && last != '!' && last != '?';
    }

    /**
     * Finds lines in the head/foot bands whose text repeats across pages. Digits are masked first
     * so that "Page 4" and "Page 5" count as the same running foot.
     */
    static Map<Integer, List<TextLineInfo>> repeatedMarginLines(List<PageContent> pages) {
        return repeatedMarginLines(pages, bodyFontSize(pages));
    }

    static Map<Integer, List<TextLineInfo>> repeatedMarginLines(
            List<PageContent> pages, float bodySize) {
        Map<Integer, List<TextLineInfo>> result = new HashMap<>();
        if (pages.isEmpty()) {
            return result;
        }
        Map<String, Integer> counts = new HashMap<>();
        Map<Integer, List<TextLineInfo>> candidates = new HashMap<>();

        for (PageContent page : pages) {
            float height = page.mediaBox().height();
            if (height <= 0) {
                continue;
            }
            float topEdge = page.mediaBox().y1() - height * MARGIN_BAND;
            float bottomEdge = page.mediaBox().y0() + height * MARGIN_BAND;
            List<TextLineInfo> inBand = new ArrayList<>();
            for (TextLineInfo line : page.lines()) {
                if (line.bbox().y0() >= topEdge || line.bbox().y1() <= bottomEdge) {
                    inBand.add(line);
                    counts.merge(mask(line.text()), 1, Integer::sum);
                }
            }
            candidates.put(page.pageIndex(), inBand);
        }

        int threshold = Math.max(2, pages.size() / 2);
        for (Map.Entry<Integer, List<TextLineInfo>> entry : candidates.entrySet()) {
            List<TextLineInfo> artifacts = new ArrayList<>();
            for (TextLineInfo line : entry.getValue()) {
                boolean repeats =
                        pages.size() >= 3 && counts.getOrDefault(mask(line.text()), 0) >= threshold;
                boolean pageNumber = PAGE_NUMBER.matcher(line.text().strip()).matches();
                // Masked digits merge "Section 1" and "Section 2"; size is the tie-break that stops
                // a real heading being demoted, as running heads are never larger than body text.
                boolean looksLikeChrome =
                        bodySize <= 0 || line.dominantFontSize() <= bodySize * 1.05f;
                if (pageNumber || (repeats && looksLikeChrome)) {
                    artifacts.add(line);
                }
            }
            result.put(entry.getKey(), artifacts);
        }
        return result;
    }

    private static String mask(String text) {
        return DIGITS.matcher(text.strip().toLowerCase()).replaceAll("#").replaceAll("\\s+", " ");
    }

    // --- Per-page analysis -------------------------------------------------

    private void analysePage(
            PageContent page,
            DocumentStructure structure,
            float bodySize,
            Map<Float, Integer> tiers,
            List<TextLineInfo> marginArtifacts) {

        for (TextLineInfo line : marginArtifacts) {
            StructBlock artifact = StructBlock.artifact(ArtifactType.PAGINATION, page.pageIndex());
            claimLine(artifact, line);
            artifact.setBbox(line.bbox());
            artifact.setText(line.text());
            structure.add(artifact);
        }

        // Identity set, not List.contains: TextLineInfo is a record whose equals walks its word
        // list, so a linear scan per line is quadratic with a deep comparison inside it.
        java.util.Set<TextLineInfo> marginSet = Collections.newSetFromMap(new IdentityHashMap<>());
        marginSet.addAll(marginArtifacts);
        List<TextLineInfo> body =
                page.lines().stream()
                        .filter(line -> !line.isBlank() && !marginSet.contains(line))
                        .sorted(readingOrder(page))
                        .toList();

        List<StructBlock> blocks = new ArrayList<>();
        int index = 0;
        while (index < body.size()) {
            TextLineInfo line = body.get(index);

            int tableEnd = tableRunEnd(body, index);
            if (tableEnd > index) {
                StructBlock table = buildTable(body.subList(index, tableEnd + 1), page.pageIndex());
                if (table != null) {
                    blocks.add(table);
                    index = tableEnd + 1;
                    continue;
                }
            }

            int listEnd = listRunEnd(body, index);
            if (listEnd > index) {
                blocks.add(buildList(body.subList(index, listEnd + 1), page.pageIndex()));
                index = listEnd + 1;
                continue;
            }

            Integer level = headingLevel(line, tiers);
            if (level != null) {
                StructBlock heading = new StructBlock(StructType.heading(level), page.pageIndex());
                claimLine(heading, line);
                heading.setBbox(line.bbox());
                heading.setText(line.text());
                blocks.add(heading);
                index++;
                continue;
            }

            int paragraphEnd = paragraphRunEnd(body, index, tiers, bodySize);
            blocks.add(buildParagraph(body.subList(index, paragraphEnd + 1), page.pageIndex()));
            index = paragraphEnd + 1;
        }

        // Form XObject text is attributed to its Do, so a Figure too would double-claim it.
        Set<Integer> claimed = new HashSet<>();
        for (StructBlock block : blocks) {
            block.visit(
                    node ->
                            node.getRanges()
                                    .forEach(
                                            range -> {
                                                for (int i = range.start(); i <= range.end(); i++) {
                                                    claimed.add(i);
                                                }
                                            }));
        }
        blocks.addAll(buildGraphics(page, structure, claimed));
        blocks.forEach(structure::add);
    }

    /**
     * Orders lines top-to-bottom, splitting into columns first when the page is clearly
     * multi-column. Without this, a two-column page reads as interleaved half-sentences.
     */
    private Comparator<TextLineInfo> readingOrder(PageContent page) {
        Float gutter = detectGutter(page);
        if (gutter == null) {
            return Comparator.comparingDouble((TextLineInfo l) -> -l.bbox().y1())
                    .thenComparingDouble(l -> l.bbox().x0());
        }
        return Comparator.comparingInt((TextLineInfo l) -> l.bbox().centreX() < gutter ? 0 : 1)
                .thenComparingDouble(l -> -l.bbox().y1())
                .thenComparingDouble(l -> l.bbox().x0());
    }

    /**
     * Returns the x of a vertical gutter when the page is two-column, else null. A gutter must sit
     * near the middle, be crossed by almost no line, and have substantial text on both sides.
     */
    static Float detectGutter(PageContent page) {
        List<TextLineInfo> lines = page.lines().stream().filter(line -> !line.isBlank()).toList();
        if (lines.size() < 8) {
            return null;
        }
        float pageWidth = page.mediaBox().width();
        if (pageWidth <= 0) {
            return null;
        }
        float centre = page.mediaBox().x0() + pageWidth / 2f;
        long crossing =
                lines.stream()
                        .filter(
                                line ->
                                        line.bbox().x0() < centre - 5
                                                && line.bbox().x1() > centre + 5)
                        .count();
        if (crossing > lines.size() * 0.1) {
            return null;
        }
        long left = lines.stream().filter(line -> line.bbox().centreX() < centre).count();
        long right = lines.size() - left;
        boolean balanced = left > lines.size() * 0.25 && right > lines.size() * 0.25;
        return balanced ? centre : null;
    }

    private static Integer headingLevel(TextLineInfo line, Map<Float, Integer> tiers) {
        if (!isHeadingCandidate(line)) {
            return null;
        }
        return tiers.get(line.dominantFontSize());
    }

    // --- Paragraphs --------------------------------------------------------

    private static int paragraphRunEnd(
            List<TextLineInfo> lines, int start, Map<Float, Integer> tiers, float bodySize) {
        int end = start;
        for (int i = start + 1; i < lines.size(); i++) {
            TextLineInfo previous = lines.get(i - 1);
            TextLineInfo current = lines.get(i);
            if (headingLevel(current, tiers) != null || startsListItem(current)) {
                break;
            }
            float gap = previous.bbox().y0() - current.bbox().y1();
            float leading = Math.max(bodySize, current.bbox().height());
            boolean sameBlock = gap < leading * 0.8f && gap > -leading;
            boolean sentenceEnded = endsSentence(previous.text());
            if (!sameBlock || (sentenceEnded && gap > leading * 0.4f)) {
                break;
            }
            end = i;
        }
        return end;
    }

    private static boolean endsSentence(String text) {
        String stripped = text.strip();
        if (stripped.isEmpty()) {
            return false;
        }
        char last = stripped.charAt(stripped.length() - 1);
        return last == '.' || last == '!' || last == '?';
    }

    private static StructBlock buildParagraph(List<TextLineInfo> lines, int pageIndex) {
        StructBlock paragraph = new StructBlock(StructType.P, pageIndex);
        BBox box = BBox.EMPTY;
        StringBuilder text = new StringBuilder();
        for (TextLineInfo line : lines) {
            claimLine(paragraph, line);
            box = box.union(line.bbox());
            if (text.length() > 0) {
                text.append(' ');
            }
            text.append(line.text().strip());
        }
        paragraph.setBbox(box);
        paragraph.setText(text.toString());
        return paragraph;
    }

    // --- Lists -------------------------------------------------------------

    static boolean startsListItem(TextLineInfo line) {
        String text = line.text().strip();
        return BULLET.matcher(text).matches() || ORDERED.matcher(text).matches();
    }

    private static int listRunEnd(List<TextLineInfo> lines, int start) {
        if (!startsListItem(lines.get(start))) {
            return start;
        }
        float indent = lines.get(start).bbox().x0();
        int end = start;
        for (int i = start + 1; i < lines.size(); i++) {
            TextLineInfo line = lines.get(i);
            boolean isItem = startsListItem(line) && Math.abs(line.bbox().x0() - indent) < 6f;
            boolean isContinuation = !startsListItem(line) && line.bbox().x0() > indent + 2f;
            if (!isItem && !isContinuation) {
                break;
            }
            end = i;
        }
        // A single marker is a stray character, not a list.
        long items =
                lines.subList(start, end + 1).stream()
                        .filter(LayoutAnalyzer::startsListItem)
                        .count();
        return items >= 2 ? end : start;
    }

    private static StructBlock buildList(List<TextLineInfo> lines, int pageIndex) {
        StructBlock list = new StructBlock(StructType.L, pageIndex);
        list.setListNumbering(listNumbering(lines.get(0)));
        BBox box = BBox.EMPTY;
        StructBlock currentBody = null;

        for (TextLineInfo line : lines) {
            box = box.union(line.bbox());
            if (startsListItem(line) || currentBody == null) {
                StructBlock item = new StructBlock(StructType.LI, pageIndex);
                StructBlock body = new StructBlock(StructType.LBODY, pageIndex);
                claimLine(body, line);
                body.setBbox(line.bbox());
                body.setText(line.text());
                item.addChild(body);
                item.setBbox(line.bbox());
                list.addChild(item);
                currentBody = body;
            } else {
                claimLine(currentBody, line);
                currentBody.setBbox(currentBody.getBbox().union(line.bbox()));
                currentBody.setText(currentBody.getText() + " " + line.text().strip());
            }
        }
        list.setBbox(box);
        return list;
    }

    private static String listNumbering(TextLineInfo first) {
        String text = first.text().strip();
        if (BULLET.matcher(text).matches()) {
            return "Disc";
        }
        char c = text.charAt(0);
        if (Character.isDigit(c)) {
            return "Decimal";
        }
        if ("ivxlc".indexOf(Character.toLowerCase(c)) >= 0 && text.length() > 1) {
            return Character.isUpperCase(c) ? "UpperRoman" : "LowerRoman";
        }
        return Character.isUpperCase(c) ? "UpperAlpha" : "LowerAlpha";
    }

    // --- Tables ------------------------------------------------------------

    /** Splits a line into cells wherever the gap between words exceeds the cell threshold. */
    static List<List<WordInfo>> splitCells(TextLineInfo line) {
        List<WordInfo> words = line.words().stream().filter(w -> !w.isBlank()).toList();
        List<List<WordInfo>> cells = new ArrayList<>();
        if (words.isEmpty()) {
            return cells;
        }
        float threshold = Math.max(line.dominantFontSize(), 1f) * CELL_GAP_RATIO;
        List<WordInfo> current = new ArrayList<>();
        current.add(words.get(0));
        for (int i = 1; i < words.size(); i++) {
            float gap = words.get(i).bbox().x0() - words.get(i - 1).bbox().x1();
            if (gap > threshold) {
                cells.add(List.copyOf(current));
                current = new ArrayList<>();
            }
            current.add(words.get(i));
        }
        cells.add(List.copyOf(current));
        return cells;
    }

    /**
     * Index of the last line of a table run starting at {@code start}, or {@code start} if none.
     */
    private static int tableRunEnd(List<TextLineInfo> lines, int start) {
        int end = start;
        for (int i = start; i < lines.size(); i++) {
            if (splitCells(lines.get(i)).size() < 2) {
                break;
            }
            end = i;
        }
        return end > start ? end : start;
    }

    /**
     * Builds a Table when the run really looks tabular and each cell owns its own operators.
     * Returns null when it does not, so the caller falls back to paragraphs.
     */
    private static StructBlock buildTable(List<TextLineInfo> rows, int pageIndex) {
        if (rows.size() < 2) {
            return null;
        }
        List<List<List<WordInfo>>> grid = new ArrayList<>();
        for (TextLineInfo row : rows) {
            if (!row.wordsAreSeparable()) {
                log.debug("Table row shares operators between cells; falling back to paragraphs");
                return null;
            }
            grid.add(splitCells(row));
        }
        int columns = grid.get(0).size();
        long consistent = grid.stream().filter(row -> row.size() == columns).count();
        if (columns < 2 || consistent < Math.max(2, grid.size() * 0.6)) {
            return null;
        }

        boolean headerRow = looksLikeHeader(rows, grid);
        StructBlock table = new StructBlock(StructType.TABLE, pageIndex);
        BBox box = BBox.EMPTY;

        for (int r = 0; r < grid.size(); r++) {
            List<List<WordInfo>> cells = grid.get(r);
            if (cells.size() != columns) {
                continue;
            }
            StructBlock tr = new StructBlock(StructType.TR, pageIndex);
            boolean isHeader = headerRow && r == 0;
            for (List<WordInfo> cell : cells) {
                StructBlock td =
                        new StructBlock(isHeader ? StructType.TH : StructType.TD, pageIndex);
                if (isHeader) {
                    td.setScope("Column");
                }
                BBox cellBox = BBox.EMPTY;
                StringBuilder text = new StringBuilder();
                int from = cell.get(0).startOrdinal();
                int to = cell.get(cell.size() - 1).endOrdinal();
                for (WordInfo word : cell) {
                    cellBox = cellBox.union(word.bbox());
                    if (text.length() > 0) {
                        text.append(' ');
                    }
                    text.append(word.text());
                }
                td.addRange(from, to);
                td.setBbox(cellBox);
                td.setText(text.toString());
                tr.addChild(td);
                box = box.union(cellBox);
            }
            tr.setBbox(box);
            table.addChild(tr);
        }
        table.setBbox(box);
        if (table.getChildren().size() < 2) {
            return null;
        }
        // Clause 7.5 needs equal cell counts per row; a ragged table fails validation outright.
        long distinctWidths =
                table.getChildren().stream()
                        .map(row -> row.getChildren().size())
                        .distinct()
                        .count();
        if (distinctWidths != 1) {
            log.debug("Discarding a table whose rows have different cell counts");
            return null;
        }
        return table;
    }

    /** The first row is a header when it is bold, or when only later rows carry numbers. */
    private static boolean looksLikeHeader(
            List<TextLineInfo> rows, List<List<List<WordInfo>>> grid) {
        if (rows.get(0).bold()) {
            return true;
        }
        boolean firstHasDigits = DIGITS.matcher(rows.get(0).text()).find();
        boolean laterHasDigits =
                rows.subList(1, rows.size()).stream()
                        .anyMatch(row -> DIGITS.matcher(row.text()).find());
        return !firstHasDigits && laterHasDigits;
    }

    // --- Graphics ----------------------------------------------------------

    private List<StructBlock> buildGraphics(
            PageContent page, DocumentStructure structure, java.util.Set<Integer> claimed) {
        List<StructBlock> blocks = new ArrayList<>();
        boolean warnedForms = false;

        // Vectors cluster: a chart is many strokes in one region, a rule is a single thin one.
        java.util.Set<Integer> vectorFigureOrdinals = vectorFigureOrdinals(page, claimed);

        for (MarkableOp op : page.ops()) {
            if (op.kind() == MarkableOp.Kind.TEXT || claimed.contains(op.ordinal())) {
                continue;
            }
            BBox box = op.bbox();

            if (op.kind() == MarkableOp.Kind.VECTOR) {
                StructBlock block;
                if (vectorFigureOrdinals.contains(op.ordinal())) {
                    block = new StructBlock(StructType.FIGURE, page.pageIndex());
                } else {
                    block = StructBlock.artifact(ArtifactType.LAYOUT, page.pageIndex());
                }
                block.addRange(op.ordinal(), op.ordinal());
                block.setBbox(box);
                blocks.add(block);
                continue;
            }

            boolean decorative = box.width() < MIN_FIGURE_SIZE || box.height() < MIN_FIGURE_SIZE;
            if (decorative) {
                StructBlock artifact = StructBlock.artifact(ArtifactType.LAYOUT, page.pageIndex());
                artifact.addRange(op.ordinal(), op.ordinal());
                artifact.setBbox(box);
                blocks.add(artifact);
                continue;
            }

            if (op.kind() == MarkableOp.Kind.FORM && !warnedForms) {
                structure.warn(
                        "Content inside form XObjects was tagged as a single region because its"
                                + " text is not separately addressable; review those areas.");
                warnedForms = true;
            }

            StructBlock figure = new StructBlock(StructType.FIGURE, page.pageIndex());
            figure.addRange(op.ordinal(), op.ordinal());
            figure.setBbox(box);
            blocks.add(figure);
        }
        return blocks;
    }

    /**
     * Finds vector operators belonging to a substantial drawing rather than page furniture; thin
     * paths are rules and table borders, and a short run is ornament.
     */
    private static Set<Integer> vectorFigureOrdinals(
            PageContent page, java.util.Set<Integer> claimed) {
        // A chart's plot area is mostly empty, while shading sits behind the text it decorates.
        Set<Integer> result = new HashSet<>();
        List<MarkableOp> run = new ArrayList<>();
        BBox extent = BBox.EMPTY;

        for (MarkableOp op : page.ops()) {
            boolean substantial =
                    op.kind() == MarkableOp.Kind.VECTOR
                            && !claimed.contains(op.ordinal())
                            && !op.bbox().isEmpty()
                            && op.bbox().width() >= MIN_VECTOR_THICKNESS
                            && op.bbox().height() >= MIN_VECTOR_THICKNESS;
            if (substantial) {
                run.add(op);
                extent = extent.isEmpty() ? op.bbox() : extent.union(op.bbox());
                continue;
            }
            flushVectorRun(run, extent, page.lines(), result);
            run = new ArrayList<>();
            extent = BBox.EMPTY;
        }
        flushVectorRun(run, extent, page.lines(), result);
        return result;
    }

    private static void flushVectorRun(
            List<MarkableOp> run,
            BBox extent,
            List<TextLineInfo> lines,
            java.util.Set<Integer> result) {
        if (run.size() < MIN_VECTOR_FIGURE_OPS
                || extent.width() < MIN_VECTOR_FIGURE_SIZE
                || extent.height() < MIN_VECTOR_FIGURE_SIZE) {
            return;
        }
        if (overlappingLines(extent, lines) > MAX_LINES_INSIDE_FIGURE) {
            return;
        }
        run.forEach(op -> result.add(op.ordinal()));
    }

    /** How many text lines sit within the region a vector cluster covers. */
    private static int overlappingLines(BBox extent, List<TextLineInfo> lines) {
        int count = 0;
        for (TextLineInfo line : lines) {
            BBox box = line.bbox();
            boolean inside =
                    box.x0() >= extent.x0() - 2
                            && box.x1() <= extent.x1() + 2
                            && box.y0() >= extent.y0() - 2
                            && box.y1() <= extent.y1() + 2;
            if (inside) {
                count++;
            }
        }
        return count;
    }

    // --- Post-processing ---------------------------------------------------

    /**
     * Rewrites heading levels so no level is skipped, which PDF/UA-1 clause 7.4 requires. A
     * document that jumps H1 to H3 is remapped to H1, H2 while preserving relative depth.
     */
    static void normaliseHeadingLevels(DocumentStructure structure) {
        List<StructBlock> headings = new ArrayList<>();
        structure.visit(
                block -> {
                    if (block.getType().isHeading()) {
                        headings.add(block);
                    }
                });
        int previous = 0;
        for (StructBlock heading : headings) {
            int level = heading.getType().headingLevel();
            int adjusted = level > previous + 1 ? previous + 1 : level;
            heading.setType(StructType.heading(adjusted));
            previous = adjusted;
        }
    }

    /** Uses the first top-level heading as the title when the document has no metadata title. */
    private static String deriveTitle(DocumentStructure structure) {
        for (StructBlock block : structure.getBlocks()) {
            if (block.getType().isHeading() && !block.getText().isBlank()) {
                return block.getText().strip();
            }
        }
        return null;
    }
}
