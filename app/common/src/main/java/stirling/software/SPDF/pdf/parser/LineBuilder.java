package stirling.software.SPDF.pdf.parser;

import static stirling.software.SPDF.pdf.parser.PdfModels.*;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Groups {@link TextFragment} objects into visual {@link RawLine}s using baseline proximity.
 *
 * <p>Fragments are on the same line when their baselines are within a font-size-derived tolerance.
 * A new line starts whenever the horizontal gap exceeds an adaptive column-gap threshold ({@code
 * max(effectiveWidth * COLUMN_GAP_RATIO, COLUMN_GAP_MIN_PT)}), splitting two-column text.
 */
@Service
@Slf4j
public class LineBuilder {

    /** Baseline tolerance as a fraction of font size; 0.5 keeps mixed-size text on one line. */
    private static final float BASELINE_TOLERANCE_FACTOR = 0.5f;

    /** Absolute minimum tolerance so tiny font sizes don't collapse multi-line content. */
    private static final float MIN_BASELINE_TOLERANCE = 2f;

    /**
     * Column-gap threshold as a fraction of page width; 0.10 clears tab stops but stays below
     * two-column gutters.
     */
    static final float COLUMN_GAP_RATIO = 0.10f;

    /** Floor for the column-gap threshold so narrow pages don't over-split lines. */
    static final float COLUMN_GAP_MIN_PT = 40f;

    public List<RawLine> build(List<TextFragment> fragments, int pageNumber) {
        if (fragments.isEmpty()) return List.of();

        float effectiveWidth = inferEffectiveWidth(fragments);
        float columnGapThreshold = Math.max(effectiveWidth * COLUMN_GAP_RATIO, COLUMN_GAP_MIN_PT);
        log.debug(
                "LineBuilder page {}: effectiveWidth={:.1f}pt, columnGapThreshold={:.1f}pt",
                pageNumber,
                effectiveWidth,
                columnGapThreshold);

        // Sort top-to-bottom first, then left-to-right within the same baseline band.
        List<TextFragment> sorted =
                fragments.stream()
                        .sorted(
                                Comparator.comparingDouble(TextFragment::baseline)
                                        .thenComparingDouble(f -> f.bounds().x()))
                        .toList();

        List<List<TextFragment>> groups = groupByBaseline(sorted, columnGapThreshold);

        List<RawLine> lines = new ArrayList<>(groups.size());
        for (int i = 0; i < groups.size(); i++) {
            List<TextFragment> group =
                    groups.get(i).stream()
                            .sorted(Comparator.comparingDouble(f -> f.bounds().x()))
                            .toList();

            Bounds lineBounds =
                    group.stream()
                            .map(TextFragment::bounds)
                            .reduce(Bounds::merge)
                            .orElse(new Bounds(0, 0, 0, 0));

            lines.add(new RawLine("ln-p" + pageNumber + "-" + i, group, lineBounds, pageNumber));
        }
        return lines;
    }

    private List<List<TextFragment>> groupByBaseline(
            List<TextFragment> sorted, float columnGapThreshold) {
        List<List<TextFragment>> groups = new ArrayList<>();
        List<TextFragment> current = new ArrayList<>();
        float currentBaseline = Float.NaN;

        for (TextFragment fragment : sorted) {
            if (current.isEmpty()) {
                current.add(fragment);
                currentBaseline = fragment.baseline();
                continue;
            }

            float maxFontSize =
                    Math.max(
                            fragment.fontSize(),
                            (float)
                                    current.stream()
                                            .mapToDouble(TextFragment::fontSize)
                                            .max()
                                            .orElse(0));
            float tolerance =
                    Math.max(maxFontSize * BASELINE_TOLERANCE_FACTOR, MIN_BASELINE_TOLERANCE);

            boolean sameBaseline = Math.abs(fragment.baseline() - currentBaseline) <= tolerance;
            boolean columnGap = sameBaseline && hasColumnGap(fragment, current, columnGapThreshold);

            if (sameBaseline && !columnGap) {
                current.add(fragment);
                // Anchor to the weighted mean baseline so long lines stay stable.
                currentBaseline =
                        (currentBaseline * (current.size() - 1) + fragment.baseline())
                                / current.size();
            } else {
                groups.add(current);
                current = new ArrayList<>();
                current.add(fragment);
                currentBaseline = fragment.baseline();
            }
        }

        if (!current.isEmpty()) groups.add(current);
        return groups;
    }

    /**
     * True when the gap from the rightmost fragment in {@code group} to {@code next} exceeds {@code
     * threshold}.
     */
    private static boolean hasColumnGap(
            TextFragment next, List<TextFragment> group, float threshold) {
        float lastRight = group.getLast().bounds().right();
        return next.bounds().x() - lastRight > threshold;
    }

    /** Infers effective page width from the rightmost fragment right-edge plus a 10 % margin. */
    private static float inferEffectiveWidth(List<TextFragment> fragments) {
        double maxRight =
                fragments.stream().mapToDouble(f -> f.bounds().right()).max().orElse(500.0);
        return (float) maxRight * 1.10f;
    }
}
