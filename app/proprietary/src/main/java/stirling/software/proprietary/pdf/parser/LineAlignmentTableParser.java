package stirling.software.proprietary.pdf.parser;

import static stirling.software.proprietary.pdf.parser.PdfModels.*;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Fallback {@link TableParser} for borderless financial tables using text geometry.
 *
 * <p>Identifies "anchor lines" (≥2 numeric tokens), builds a column grid from their right-edge
 * positions, groups vertically proximate anchor lines into table candidates, then scores each group
 * on column consistency and anchor density (confidence ceiling 0.85).
 */
@Service
@Slf4j
public class LineAlignmentTableParser implements TableParser {

    /** Width in points of each column position bucket. */
    static final float COLUMN_BUCKET_PT = 5f;

    /** Tolerance in buckets when matching a token's right-edge to a confirmed column position. */
    private static final int COLUMN_MATCH_BUCKETS = 2;

    /** Maximum gap (as a multiple of modal line spacing) before splitting a group. */
    private static final float MAX_GAP_FACTOR = 2.5f;

    /** Minimum anchor rows (numeric-heavy) to form a valid table. */
    static final int MIN_TABLE_ROWS = 3;

    /** Minimum confirmed column positions to form a valid table. */
    static final int MIN_COLUMNS = 2;

    /**
     * Min fraction of anchor lines a column must appear on to be confirmed (permissive for N/A
     * rows).
     */
    private static final double COLUMN_MIN_FREQUENCY = 0.40;

    /**
     * Matches financial numeric tokens: integers, decimals, parenthetical negatives, currency,
     * percent, nil dashes.
     */
    private static final Pattern NUMERIC =
            Pattern.compile("^[\\(\\-\\$£€¥]?\\d[\\d,\\.]*[\\)%]?$|^[-–—]$");

    /**
     * Lines within this y-distance are merged into one row (restores rows split by LineBuilder's
     * column-gap logic).
     */
    static final float ROW_MERGE_TOLERANCE_PT = 2f;

    // ── public API ───────────────────────────────────────────────────────────────────────────────

    @Override
    public List<TableFragment> parse(PDDocument document, RawPage rawPage) throws IOException {
        List<RawLine> lines = rawPage.lines();
        if (lines.size() < MIN_TABLE_ROWS) return List.of();

        float modalSpacing = computeModalSpacing(lines);
        List<TokenizedLine> tokenized =
                mergeCoincidentLines(lines.stream().map(this::tokenize).toList());

        List<TokenizedLine> anchors = tokenized.stream().filter(TokenizedLine::isAnchor).toList();

        if (anchors.size() < MIN_TABLE_ROWS) return List.of();

        List<Float> columnGrid = buildColumnGrid(anchors);
        if (columnGrid.size() < MIN_COLUMNS) {
            log.debug(
                    "Page {}: LineAlignment — fewer than {} confirmed columns, skipping",
                    rawPage.pageNumber(),
                    MIN_COLUMNS);
            return List.of();
        }

        List<List<TokenizedLine>> groups = groupRows(tokenized, columnGrid, modalSpacing);

        List<TableFragment> results = new ArrayList<>();
        for (int i = 0; i < groups.size(); i++) {
            buildFragment(groups.get(i), columnGrid, rawPage.pageNumber(), i)
                    .ifPresent(results::add);
        }

        log.debug(
                "Page {}: LineAlignment detected {} table(s) ({} anchor lines, {} columns)",
                rawPage.pageNumber(),
                results.size(),
                anchors.size(),
                columnGrid.size());
        return results;
    }

    // ── coincident-line merging ──────────────────────────────────────────────────────────────────

    /**
     * Merges tokenised lines sharing the same y-position into one row, rejoining label/value halves
     * split by LineBuilder.
     */
    List<TokenizedLine> mergeCoincidentLines(List<TokenizedLine> tokenized) {
        if (tokenized.size() < 2) return tokenized;

        List<TokenizedLine> result = new ArrayList<>();
        int i = 0;

        while (i < tokenized.size()) {
            float baseY = tokenized.get(i).line().bounds().y();
            int j = i + 1;
            while (j < tokenized.size()
                    && Math.abs(tokenized.get(j).line().bounds().y() - baseY)
                            <= ROW_MERGE_TOLERANCE_PT) {
                j++;
            }

            if (j == i + 1) {
                result.add(tokenized.get(i));
            } else {
                result.add(mergeGroup(tokenized.subList(i, j)));
            }
            i = j;
        }

        return result;
    }

    private TokenizedLine mergeGroup(List<TokenizedLine> group) {
        List<TextFragment> mergedFragments =
                group.stream()
                        .flatMap(tl -> tl.line().fragments().stream())
                        .sorted(Comparator.comparingDouble(f -> f.bounds().x()))
                        .toList();

        Bounds mergedBounds =
                group.stream()
                        .map(tl -> tl.line().bounds())
                        .reduce(Bounds::merge)
                        .orElse(group.get(0).line().bounds());

        RawLine mergedLine =
                new RawLine(
                        group.get(0).line().lineId(),
                        mergedFragments,
                        mergedBounds,
                        group.get(0).line().pageNumber());

        return tokenize(mergedLine);
    }

    // ── tokenisation ─────────────────────────────────────────────────────────────────────────────

    /**
     * Splits fragments into word-level tokens; x-positions are estimated linearly within each
     * fragment.
     */
    TokenizedLine tokenize(RawLine line) {
        List<LineToken> tokens = new ArrayList<>();
        for (TextFragment frag : line.fragments()) {
            tokens.addAll(tokensFromFragment(frag));
        }
        List<LineToken> numeric = tokens.stream().filter(LineToken::numeric).toList();
        return new TokenizedLine(line, tokens, numeric);
    }

    private List<LineToken> tokensFromFragment(TextFragment frag) {
        String raw = frag.text();
        if (raw == null || raw.isBlank()) return List.of();

        float fragX = frag.bounds().x();
        float fragWidth = frag.bounds().width();
        int rawLen = raw.length();

        List<LineToken> result = new ArrayList<>();
        int offset = 0;
        for (String part : raw.split("\\s+")) {
            if (part.isEmpty()) {
                offset++;
                continue;
            }
            int idx = raw.indexOf(part, offset);
            if (idx < 0) idx = offset;

            float tokenX = rawLen > 0 ? fragX + ((float) idx / rawLen) * fragWidth : fragX;
            float tokenRight =
                    rawLen > 0
                            ? fragX + ((float) (idx + part.length()) / rawLen) * fragWidth
                            : fragX + fragWidth;

            result.add(new LineToken(part, tokenX, tokenRight, NUMERIC.matcher(part).matches()));
            offset = idx + part.length();
        }
        return result;
    }

    // ── column grid ──────────────────────────────────────────────────────────────────────────────

    /**
     * Returns confirmed column right-edge positions — those appearing on ≥ {@value
     * #COLUMN_MIN_FREQUENCY} × N anchor lines.
     */
    private List<Float> buildColumnGrid(List<TokenizedLine> anchors) {
        // bucket → set of line indices that contributed a numeric token to that bucket
        Map<Integer, List<Integer>> bucketLines = new HashMap<>();
        for (int i = 0; i < anchors.size(); i++) {
            for (LineToken t : anchors.get(i).numeric()) {
                int bucket = bucket(t.right());
                bucketLines.computeIfAbsent(bucket, k -> new ArrayList<>()).add(i);
            }
        }

        int minHits =
                Math.max(MIN_TABLE_ROWS, (int) Math.ceil(anchors.size() * COLUMN_MIN_FREQUENCY));

        // Confirmed buckets → average right-edge for that bucket
        TreeMap<Integer, Float> confirmed = new TreeMap<>();
        for (Map.Entry<Integer, List<Integer>> entry : bucketLines.entrySet()) {
            // Count distinct lines
            long distinctLines = entry.getValue().stream().distinct().count();
            if (distinctLines >= minHits) {
                double avg =
                        entry.getValue().stream()
                                .distinct() // weight each line equally regardless of token count
                                .mapToDouble(
                                        lineIdx ->
                                                anchors.get(lineIdx).numeric().stream()
                                                        .filter(
                                                                t ->
                                                                        bucket(t.right())
                                                                                == entry.getKey())
                                                        .mapToDouble(LineToken::right)
                                                        .average()
                                                        .orElse(
                                                                entry.getKey()
                                                                        * (double)
                                                                                COLUMN_BUCKET_PT))
                                .average()
                                .orElse(entry.getKey() * (double) COLUMN_BUCKET_PT);
                confirmed.put(entry.getKey(), (float) avg);
            }
        }

        return new ArrayList<>(confirmed.values()); // already sorted by bucket (left to right)
    }

    // ── grouping ─────────────────────────────────────────────────────────────────────────────────

    /**
     * Groups anchor lines into table candidates, including adjacent label rows; a gap &gt;
     * MAX_GAP_FACTOR × modal spacing splits groups.
     */
    private List<List<TokenizedLine>> groupRows(
            List<TokenizedLine> all, List<Float> columnGrid, float modalSpacing) {
        float maxGap = modalSpacing > 0 ? modalSpacing * MAX_GAP_FACTOR : 30f;

        List<List<TokenizedLine>> groups = new ArrayList<>();
        List<TokenizedLine> current = new ArrayList<>();

        for (int i = 0; i < all.size(); i++) {
            TokenizedLine tl = all.get(i);
            boolean fits = tl.isAnchor() && matchesGrid(tl, columnGrid);

            if (current.isEmpty()) {
                if (fits) current.add(tl);
                continue;
            }

            float gap =
                    tl.line().bounds().y()
                            - current.get(current.size() - 1).line().bounds().bottom();

            if (gap > maxGap) {
                groups.add(current);
                current = new ArrayList<>();
                if (fits) current.add(tl);
                continue;
            }

            if (fits) {
                current.add(tl);
            } else if (!tl.line().text().isBlank()) {
                // Include non-anchor lines (labels) only if they have text and are within
                // proximity.
                current.add(tl);
            }
        }

        if (!current.isEmpty()) groups.add(current);

        return groups.stream()
                .filter(
                        g ->
                                g.stream()
                                                .filter(
                                                        r ->
                                                                r.isAnchor()
                                                                        && matchesGrid(
                                                                                r, columnGrid))
                                                .count()
                                        >= MIN_TABLE_ROWS)
                .toList();
    }

    /** A line "matches" the grid when ≥ 60 % of its numeric tokens land in confirmed columns. */
    private boolean matchesGrid(TokenizedLine tl, List<Float> columnGrid) {
        if (tl.numeric().isEmpty()) return false;
        long matches =
                tl.numeric().stream()
                        .filter(t -> nearestColumnIndex(t.right(), columnGrid) >= 0)
                        .count();
        return (double) matches / tl.numeric().size() >= 0.60;
    }

    // ── fragment assembly ────────────────────────────────────────────────────────────────────────

    private Optional<TableFragment> buildFragment(
            List<TokenizedLine> group, List<Float> columnGrid, int pageNumber, int tableIndex) {

        long anchorCount =
                group.stream().filter(r -> r.isAnchor() && matchesGrid(r, columnGrid)).count();
        if (anchorCount < MIN_TABLE_ROWS) return Optional.empty();

        List<String> warnings = new ArrayList<>();
        List<List<String>> rawRows = new ArrayList<>();
        List<TableRow> rows = new ArrayList<>();

        for (int rowIdx = 0; rowIdx < group.size(); rowIdx++) {
            TokenizedLine tl = group.get(rowIdx);
            List<String> rawRow = buildRawRow(tl, columnGrid);
            rawRows.add(Collections.unmodifiableList(rawRow));
            rows.add(buildTableRow(rowIdx, tl, rawRow, columnGrid));
        }

        // Column count = 1 label column + confirmed numeric columns
        int colCount = columnGrid.size() + 1;
        Bounds bounds = computeGroupBounds(group);
        float confidence = computeConfidence(group, columnGrid, warnings);

        return Optional.of(
                new TableFragment(
                        "tbl-la-p" + pageNumber + "-" + tableIndex,
                        pageNumber,
                        bounds,
                        List.of(),
                        Collections.unmodifiableList(rows),
                        Collections.unmodifiableList(rawRows),
                        colCount,
                        confidence,
                        Collections.unmodifiableList(warnings),
                        null));
    }

    /**
     * Builds a raw row as a list of strings: index 0 = label text, indices 1..N = column values.
     */
    private List<String> buildRawRow(TokenizedLine tl, List<Float> columnGrid) {
        String[] cells = new String[columnGrid.size() + 1];
        Arrays.fill(cells, "");

        // Separate label tokens (those not landing in any confirmed column) from column tokens.
        List<String> labelParts = new ArrayList<>();
        for (LineToken token : tl.all()) {
            int col = nearestColumnIndex(token.right(), columnGrid);
            if (col >= 0 && token.numeric()) {
                int cellIdx = col + 1;
                cells[cellIdx] =
                        cells[cellIdx].isEmpty()
                                ? token.text()
                                : cells[cellIdx] + " " + token.text();
            } else {
                labelParts.add(token.text());
            }
        }
        cells[0] = String.join(" ", labelParts).trim();
        return Arrays.asList(cells);
    }

    private TableRow buildTableRow(
            int rowIdx, TokenizedLine tl, List<String> rawRow, List<Float> columnGrid) {
        List<TableCell> cells = new ArrayList<>(rawRow.size());

        // Label cell: use the line's full bounds as an approximation.
        cells.add(TableCell.of(0, rawRow.get(0), tl.line().bounds()));

        for (int col = 0; col < columnGrid.size(); col++) {
            String text = col + 1 < rawRow.size() ? rawRow.get(col + 1) : "";
            float right = columnGrid.get(col);
            float left = col > 0 ? columnGrid.get(col - 1) : right - 50f;
            Bounds cellBounds =
                    new Bounds(
                            left,
                            tl.line().bounds().y(),
                            right - left,
                            tl.line().bounds().height());
            cells.add(TableCell.of(col + 1, text, cellBounds));
        }
        return new TableRow(rowIdx, Collections.unmodifiableList(cells));
    }

    // ── confidence scoring ───────────────────────────────────────────────────────────────────────

    /**
     * Heuristic score in [0.0, 0.85] (ceiling keeps results below Tabula lattice which starts at
     * 1.0). Base 0.70; +0.05/col beyond 2 (max +0.10); +0.05 at ≥5 anchors, +0.05 at ≥8; −0.15 if
     * &gt;30 % of anchors have inconsistent columns; −0.10 if non-anchors outnumber anchors.
     */
    private float computeConfidence(
            List<TokenizedLine> group, List<Float> columnGrid, List<String> warnings) {
        float score = 0.70f;

        long anchorCount =
                group.stream().filter(r -> r.isAnchor() && matchesGrid(r, columnGrid)).count();
        long totalRows = group.size();

        // More columns
        int extraCols = Math.min(columnGrid.size() - MIN_COLUMNS, 2);
        score += extraCols * 0.05f;

        // More anchor rows
        if (anchorCount >= 5) score += 0.05f;
        if (anchorCount >= 8) score += 0.05f;

        // Inconsistent column matching
        long inconsistent =
                group.stream()
                        .filter(TokenizedLine::isAnchor)
                        .filter(
                                tl -> {
                                    long hits =
                                            tl.numeric().stream()
                                                    .filter(
                                                            t ->
                                                                    nearestColumnIndex(
                                                                                    t.right(),
                                                                                    columnGrid)
                                                                            >= 0)
                                                    .count();
                                    return tl.numeric().size() > 0
                                            && (double) hits / tl.numeric().size() < 0.60;
                                })
                        .count();
        if (inconsistent > anchorCount * 0.30) {
            score -= 0.15f;
            warnings.add(
                    "Column match inconsistent on "
                            + inconsistent
                            + "/"
                            + anchorCount
                            + " anchor rows");
        }

        // Label-heavy
        long nonAnchor = totalRows - anchorCount;
        if (nonAnchor > anchorCount) {
            score -= 0.10f;
            warnings.add(
                    "Non-anchor rows ("
                            + nonAnchor
                            + ") outnumber anchor rows ("
                            + anchorCount
                            + ")");
        }

        return Math.max(0f, Math.min(0.85f, score));
    }

    // ── utility ──────────────────────────────────────────────────────────────────────────────────

    /**
     * Returns the grid index nearest to {@code rightEdge}, or -1 if none is within {@value
     * #COLUMN_MATCH_BUCKETS} buckets.
     */
    private int nearestColumnIndex(float rightEdge, List<Float> grid) {
        int nearest = -1;
        float minDist = COLUMN_MATCH_BUCKETS * COLUMN_BUCKET_PT + 1f;
        for (int i = 0; i < grid.size(); i++) {
            float dist = Math.abs(rightEdge - grid.get(i));
            if (dist < minDist) {
                minDist = dist;
                nearest = i;
            }
        }
        return nearest;
    }

    private Bounds computeGroupBounds(List<TokenizedLine> group) {
        return group.stream()
                .map(tl -> tl.line().bounds())
                .reduce(Bounds::merge)
                .orElse(new Bounds(0, 0, 0, 0));
    }

    /** Modal gap between consecutive line edges, used to calibrate the group-split threshold. */
    private float computeModalSpacing(List<RawLine> lines) {
        if (lines.size() < 2) return 0f;
        Map<Float, Long> freq = new HashMap<>();
        for (int i = 1; i < lines.size(); i++) {
            float gap = lines.get(i).bounds().y() - lines.get(i - 1).bounds().bottom();
            if (gap > 0) freq.merge(Math.round(gap / 2f) * 2f, 1L, Long::sum);
        }
        return freq.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse(0f);
    }

    private static int bucket(float x) {
        return Math.round(x / COLUMN_BUCKET_PT);
    }

    // ── private data types ───────────────────────────────────────────────────────────────────────

    /** A word-level token with an approximate right-edge x-position. */
    record LineToken(String text, float x, float right, boolean numeric) {}

    /** A {@link RawLine} with tokens pre-computed; an "anchor" has ≥ 2 numeric tokens. */
    record TokenizedLine(RawLine line, List<LineToken> all, List<LineToken> numeric) {
        boolean isAnchor() {
            return numeric.size() >= 2;
        }
    }
}
