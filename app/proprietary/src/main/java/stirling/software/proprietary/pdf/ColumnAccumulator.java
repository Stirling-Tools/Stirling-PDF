package stirling.software.proprietary.pdf;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import stirling.software.jpdfium.text.TextWord;

/**
 * Incremental {@link ColumnRanges#find(List)} for a stitched table: appending a page costs O(page),
 * bit-for-bit identical to re-projecting the lot.
 */
final class ColumnAccumulator {

    private int lineCount;
    private float minX = Float.MAX_VALUE;
    private float maxX = -Float.MAX_VALUE;
    private double totalWidth;
    private int totalChars;

    /** Coverage counts, cov[i] = lines covering absolute x-bucket covBase + i. */
    private int[] cov = new int[0];

    private int covBase;

    /** Set once the x-span exceeds what findColumnRanges accepts; no histogram is then kept. */
    private boolean oversized;

    private boolean[] scratch = new boolean[0];

    static ColumnAccumulator of(List<List<Line>> rows) {
        ColumnAccumulator a = new ColumnAccumulator();
        for (List<Line> row : rows) {
            for (Line l : row) {
                a.addLine(l);
            }
        }
        return a;
    }

    void addLine(Line l) {
        lineCount++;
        List<TextWord> words = l.words();
        int lineLo = Integer.MAX_VALUE;
        int lineHi = Integer.MIN_VALUE;
        for (TextWord w : words) {
            float x0 = w.x();
            float x1 = x0 + w.width();
            minX = Math.min(minX, x0);
            maxX = Math.max(maxX, x1);
            totalWidth += w.width();
            totalChars += Math.max(1, w.text().strip().length());
            int a = (int) Math.floor(x0);
            int b = (int) Math.ceil(x1);
            if (a < lineLo) {
                lineLo = a;
            }
            if (b > lineHi) {
                lineHi = b;
            }
        }
        // Mirrors ColumnRanges.find's guard: past this span it returns no columns, so the
        // histogram is dead weight and (with crafted coordinates) unboundedly large.
        if (!oversized && (maxX - minX) > 2000f) {
            oversized = true;
            cov = null;
            scratch = null;
        }
        if (oversized || lineHi <= lineLo) {
            return;
        }
        ensureRange(lineLo, lineHi);
        int n = lineHi - lineLo;
        if (scratch.length < n) {
            scratch = new boolean[n];
        } else {
            Arrays.fill(scratch, 0, n, false);
        }
        for (TextWord w : words) {
            int a = (int) Math.floor(w.x()) - lineLo;
            int b = (int) Math.ceil(w.x() + w.width()) - lineLo;
            for (int x = a; x < b; x++) {
                scratch[x] = true;
            }
        }
        int off = lineLo - covBase;
        for (int x = 0; x < n; x++) {
            if (scratch[x]) {
                cov[off + x]++;
            }
        }
    }

    private void ensureRange(int lo, int hi) {
        if (cov.length == 0) {
            covBase = lo - 32;
            cov = new int[(hi - lo) + 64];
            return;
        }
        int have0 = covBase;
        int have1 = covBase + cov.length;
        if (lo >= have0 && hi <= have1) {
            return;
        }
        int newBase = Math.min(have0, lo) - 32;
        int newEnd = Math.max(have1, hi) + 32;
        int[] nc = new int[newEnd - newBase];
        System.arraycopy(cov, 0, nc, have0 - newBase, cov.length);
        cov = nc;
        covBase = newBase;
    }

    /** Exactly what {@link ColumnRanges#find(List)} would return for the accumulated lines. */
    List<float[]> columns() {
        if (oversized || maxX <= minX || (maxX - minX) > 2000f) {
            return List.of();
        }
        int lo = (int) Math.floor(minX);
        int span = Math.min((int) Math.ceil(maxX) - lo + 1, 2001);
        int support = Math.max(2, Math.round(lineCount * 0.35f));
        List<float[]> columns = new ArrayList<>();
        int start = -1;
        for (int x = 0; x < span; x++) {
            int idx = lo + x - covBase;
            int c = (idx >= 0 && idx < cov.length) ? cov[idx] : 0;
            boolean isColumn = c >= support;
            if (isColumn && start < 0) {
                start = x;
            } else if (!isColumn && start >= 0) {
                columns.add(new float[] {lo + start, lo + x});
                start = -1;
            }
        }
        if (start >= 0) {
            columns.add(new float[] {(float) (lo + start), (float) (lo + span)});
        }

        float charWidth = totalChars == 0 ? 6f : (float) (totalWidth / totalChars);
        float minGutter = Math.max(10f, charWidth * 2.5f);
        List<float[]> merged = new ArrayList<>();
        for (float[] band : columns) {
            if (!merged.isEmpty() && band[0] - merged.get(merged.size() - 1)[1] < minGutter) {
                merged.get(merged.size() - 1)[1] = band[1];
            } else {
                merged.add(new float[] {band[0], band[1]});
            }
        }
        return merged;
    }
}
