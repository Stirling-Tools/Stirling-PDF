package stirling.software.proprietary.pdf;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

import stirling.software.jpdfium.text.TextLine;

/**
 * Multi-column page layout: finding the gutters between columns of prose, splitting a page's lines
 * at them, and emitting the columns in reading order.
 */
final class ColumnLayout {

    private ColumnLayout() {}

    /** Narrowest run of near-empty x that can separate two columns of prose. */
    private static final float MIN_GUTTER = 10f;

    /** Narrowest column worth splitting out; below this a "gutter" is just a ragged margin. */
    private static final float MIN_COLUMN = 70f;

    /** Fraction of a page's lines that may cross a gutter and still leave it a gutter. */
    private static final float MAX_CROSSING = 0.15f;

    /** Most columns recognised on one page. Beyond this the geometry is a table, not a layout. */
    private static final int MAX_COLUMNS = 4;

    /**
     * Finds the page's column gutters, or empty for a single column. Scans the 5th to 95th
     * percentile of line edges so one degenerate box cannot drag it off the page.
     */
    static List<Float> detectGutters(List<Line> lines) {
        if (lines.size() < 8) {
            return List.of();
        }
        int n = lines.size();
        float[] los = new float[n];
        float[] his = new float[n];
        for (int i = 0; i < n; i++) {
            los[i] = lines.get(i).left();
            his[i] = lines.get(i).right();
        }
        float[] sortedLo = los.clone();
        float[] sortedHi = his.clone();
        Arrays.sort(sortedLo);
        Arrays.sort(sortedHi);
        float lo = sortedLo[(int) (n * 0.05f)];
        float hi = sortedHi[Math.min(n - 1, (int) (n * 0.95f))];
        if (hi - lo < 2 * MIN_COLUMN + MIN_GUTTER || !plausibleSpan(lo, hi)) {
            return List.of();
        }

        int maxCrossing = (int) (n * MAX_CROSSING);
        int start = -1;
        List<float[]> bands = new ArrayList<>();
        // Stepped as an int: past 2^24 a float can no longer represent x + 1, so a float counter
        // over a crafted coordinate stops advancing and spins forever.
        int scanFrom = (int) Math.floor(lo + MIN_COLUMN);
        int scanTo = (int) Math.ceil(hi - MIN_COLUMN);
        for (int xi = scanFrom; xi <= scanTo; xi++) {
            float x = xi;
            int crossing = 0;
            for (int i = 0; i < n; i++) {
                if (los[i] < x - 2f && his[i] > x + 2f) {
                    crossing++;
                }
            }
            if (crossing <= maxCrossing) {
                if (start < 0) {
                    start = (int) x;
                }
            } else if (start >= 0) {
                bands.add(new float[] {start, x});
                start = -1;
            }
        }
        if (start >= 0) {
            bands.add(new float[] {start, hi - MIN_COLUMN});
        }

        // Widest first, so the strongest separation wins; then keep only bands MIN_COLUMN apart.
        bands.sort(Comparator.comparingDouble((float[] b) -> b[1] - b[0]).reversed());
        List<Float> gutters = new ArrayList<>();
        for (float[] b : bands) {
            if (b[1] - b[0] < MIN_GUTTER || gutters.size() >= MAX_COLUMNS - 1) {
                continue;
            }
            float mid = (b[0] + b[1]) / 2f;
            boolean tooClose = mid - lo < MIN_COLUMN || hi - mid < MIN_COLUMN;
            for (float g : gutters) {
                tooClose |= Math.abs(g - mid) < MIN_COLUMN;
            }
            if (!tooClose) {
                gutters.add(mid);
            }
        }
        gutters.sort(Comparator.naturalOrder());

        if (!gutters.isEmpty() && columnsLookLikeText(lines, gutters)) {
            return gutters;
        }
        return centralGutter(lines, los, his, lo, hi);
    }

    /**
     * Rejects geometry too wide to be real: past 2^24 a float cannot represent x + 1, so a
     * constant-step scan stops advancing.
     */
    private static boolean plausibleSpan(float lo, float hi) {
        return Float.isFinite(lo) && Float.isFinite(hi) && (hi - lo) <= 2000f;
    }

    /** Fallback: accepts halves of scattered labels, which read as columns but not as prose. */
    private static List<Float> centralGutter(
            List<Line> lines, float[] los, float[] his, float lo, float hi) {
        int n = lines.size();
        float centreLo = lo + (hi - lo) * 0.35f;
        float centreHi = lo + (hi - lo) * 0.65f;
        int bestCrossing = Integer.MAX_VALUE;
        float bestAt = 0f;
        int bestLeft = 0;
        int bestRight = 0;
        for (int gi = (int) Math.floor(centreLo); gi <= (int) Math.ceil(centreHi); gi += 2) {
            float gutter = gi;
            int crossing = 0;
            int left = 0;
            int right = 0;
            for (int i = 0; i < n; i++) {
                if (los[i] < gutter - 5f && his[i] > gutter + 5f) {
                    crossing++;
                } else if (his[i] <= gutter) {
                    left++;
                } else {
                    right++;
                }
            }
            if (crossing < bestCrossing) {
                bestCrossing = crossing;
                bestAt = gutter;
                bestLeft = left;
                bestRight = right;
            }
        }
        boolean ok = bestLeft >= 4 && bestRight >= 4 && bestCrossing <= (int) (n * 0.25f);
        return ok ? List.of(bestAt) : List.of();
    }

    /** Lines of at least this fraction of a column's width count as that column's body text. */
    private static final float BODY_LINE_WIDTH = 0.5f;

    /** Body lines a column must hold before it is accepted as a column. */
    private static final int BODY_LINES = 4;

    /**
     * True when every carved-out column reads as running text; projection alone cannot tell prose
     * from any other empty lane, such as a bar chart's label gaps.
     */
    private static boolean columnsLookLikeText(List<Line> lines, List<Float> gutters) {
        // Judge only lines inside a column: a spanning line is assigned to one by its centre, and
        // its width would set a measure no real body line could reach.
        List<Line> inside =
                lines.stream().filter(l -> !spansGutter(l, gutters)).collect(Collectors.toList());
        List<List<Line>> columns = splitIntoColumns(inside, gutters);
        if (columns.size() < 2) {
            return false;
        }
        for (List<Line> column : columns) {
            float lo = Float.MAX_VALUE;
            float hi = -Float.MAX_VALUE;
            for (Line l : column) {
                lo = Math.min(lo, l.left());
                hi = Math.max(hi, l.right());
            }
            float measure = hi - lo;
            int body = 0;
            for (Line l : column) {
                if (l.right() - l.left() >= measure * BODY_LINE_WIDTH) {
                    body++;
                }
            }
            if (body < BODY_LINES || measure < MIN_COLUMN) {
                return false;
            }
        }
        return true;
    }

    /**
     * Splits lines into columns at the given gutters. A line crossing one goes to the column its
     * centre falls in; band ordering then places it correctly.
     */
    static List<List<Line>> splitIntoColumns(List<Line> lines, List<Float> gutters) {
        if (gutters.isEmpty()) {
            return List.of(lines);
        }
        List<List<Line>> columns = new ArrayList<>(gutters.size() + 1);
        for (int i = 0; i <= gutters.size(); i++) {
            columns.add(new ArrayList<>());
        }
        for (Line l : lines) {
            columns.get(columnOf(l, gutters)).add(l);
        }
        columns.removeIf(List::isEmpty);
        return columns;
    }

    private static int columnOf(Line l, List<Float> gutters) {
        float centre = (l.left() + l.right()) / 2f;
        int col = 0;
        while (col < gutters.size() && centre > gutters.get(col)) {
            col++;
        }
        return col;
    }

    /**
     * True when the finished lines still respect the gutters the unmerged lines showed; merging
     * widens lines, and band-ordering a straddled gutter interleaves the columns.
     */
    static boolean gutterRespected(List<Line> lines, List<Float> gutters) {
        List<Line> real = lines.stream().filter(l -> !l.synthetic).toList();
        if (real.isEmpty()) {
            return false;
        }
        long spanning = real.stream().filter(l -> spansGutter(l, gutters)).count();
        return spanning <= real.size() * BAND_CROSSING;
    }

    /** Fraction of the finished lines that may straddle a gutter and still allow band ordering. */
    private static final float BAND_CROSSING = 0.35f;

    /** Fallback column split: cut at the widest gap between the lines' left edges. */
    static List<List<Line>> legacySplit(List<Line> lines) {
        List<Float> xs =
                lines.stream()
                        .filter(l -> l.width >= 40f)
                        .map(l -> l.x)
                        .sorted()
                        .collect(Collectors.toList());
        if (xs.isEmpty()) {
            return List.of(lines);
        }
        float splitAt = (xs.getFirst() + xs.getLast()) / 2f;
        float biggestGap = 0;
        for (int i = 1; i < xs.size(); i++) {
            float gap = xs.get(i) - xs.get(i - 1);
            if (gap > biggestGap) {
                biggestGap = gap;
                splitAt = (xs.get(i - 1) + xs.get(i)) / 2f;
            }
        }
        List<Line> left = new ArrayList<>();
        List<Line> right = new ArrayList<>();
        for (Line l : lines) {
            (l.x < splitAt ? left : right).add(l);
        }
        if (left.isEmpty()) {
            return List.of(right);
        }
        if (right.isEmpty()) {
            return List.of(left);
        }
        return List.of(left, right);
    }

    /** Longest a line may be and still be a line of a heading rather than of a paragraph. */
    private static final int HEADING_LENGTH_WORDS = 12;

    /**
     * True when a spanning line is short enough to be one line of a full-width banner heading,
     * which {@link #orderByBand} keeps in a single group.
     */
    private static boolean headingLength(Line l) {
        return MarkdownText.wordCount(l.text) <= HEADING_LENGTH_WORDS;
    }

    /** True when a line straddles a gutter, i.e. it belongs to no single column. */
    static boolean spansGutter(Line l, List<Float> gutters) {
        float left = l.left();
        float right = l.right();
        for (float g : gutters) {
            if (left < g - 2f && right > g + 2f) {
                return true;
            }
        }
        return false;
    }

    /**
     * Orders a multi-column region as a one-level XY cut: spanning lines cut it into bands, and
     * each band's columns are emitted in turn.
     */
    static List<List<Line>> orderByBand(List<Line> lines, List<Float> gutters) {
        List<Line> ordered = new ArrayList<>(lines);
        ordered.sort(Comparator.comparingDouble((Line l) -> l.y).reversed());
        List<List<Line>> out = new ArrayList<>();
        List<Line> band = new ArrayList<>();
        List<Line> spanning = new ArrayList<>();
        for (Line l : ordered) {
            if (spansGutter(l, gutters)) {
                if (spanning.isEmpty()) {
                    out.addAll(splitIntoColumns(band, gutters));
                    band = new ArrayList<>();
                } else if (!headingLength(l) || !headingLength(spanning.get(spanning.size() - 1))) {
                    // Only heading-length lines are kept together: a full-width paragraph or list
                    // is also a run of spanning lines, and merging those runs its items together.
                    out.add(new ArrayList<>(spanning));
                    spanning.clear();
                }
                spanning.add(l);
            } else {
                if (!spanning.isEmpty()) {
                    out.add(new ArrayList<>(spanning));
                    spanning.clear();
                }
                band.add(l);
            }
        }
        if (!spanning.isEmpty()) {
            out.add(new ArrayList<>(spanning));
        }
        out.addAll(splitIntoColumns(band, gutters));
        out.removeIf(List::isEmpty);
        return out;
    }

    /** Visible for testing: as {@link ColumnRanges#fromTextLines(List)}, for gutter detection. */
    static List<Float> guttersFromTextLines(List<TextLine> rows) {
        return detectGutters(rows.stream().map(Line::new).collect(Collectors.toList()));
    }
}
