package stirling.software.common.pdf;

import lombok.extern.slf4j.Slf4j;

/**
 * Single entry point for the {@code stirling.md.*} System properties that tune Markdown extraction.
 *
 * <p>These are internal, unsupported tuning and ablation switches, not product configuration: they
 * exist so the extraction pipeline can be A/B'd against the golden fixtures without a rebuild.
 * Defaults are what ships, and nothing outside this package should set them. Every key lives at its
 * own constant in {@link PdfMarkdownConverter}, {@link HeadingDetector} or {@link TableSpans}, next
 * to the behaviour it controls; the full list is below.
 *
 * <p>Layout: {@code bandCrossing}, {@code bandOrder}, {@code columnRun}, {@code fallbackGutter},
 * {@code gutterScan}, {@code headerOnlyColumns}, {@code maxCrossing}, {@code minColumn}, {@code
 * minGutter}.
 *
 * <p>Headings: {@code allCaps}, {@code bodyLineWidth}, {@code bodyLines}, {@code
 * bulletNeverHeading}, {@code detectOnFragment}, {@code headings}, {@code runOnBold}, {@code
 * runOnGuard}, {@code wideBullets}, {@code wrapHeadings}, {@code wrapSize}.
 *
 * <p>Tables: {@code bannerFirstColumn}, {@code bannerRow}, {@code completeLattice}, {@code
 * drawnGridSparse}, {@code gridCell}, {@code gridColumns}, {@code headerAbove}, {@code headerGap},
 * {@code headerRuleGap}, {@code minInteriorRules}, {@code proseCell}, {@code proseGuard}, {@code
 * rowRuleSpan}, {@code rowspanRules}, {@code ruledTables}, {@code spanGeometry}, {@code spanRuns},
 * {@code splitCompleteBands}, {@code tableFormat}, {@code tocRows}, {@code wideRowRules}, {@code
 * wideUnruledTables}.
 *
 * <p>Text and output: {@code formValues}, {@code imageMode}, {@code maxMergeGap}, {@code
 * mergeFragments}, {@code softHyphen}, {@code textRepair}.
 *
 * <p>All reads fall back to the default rather than throwing: these constants are initialised in
 * static initialisers, where a malformed value would otherwise raise {@code
 * ExceptionInInitializerError} and leave the converter permanently unloadable for the JVM's life.
 */
@Slf4j
final class MdTuning {

    private MdTuning() {}

    /** Float-valued knob, e.g. a ratio or a point distance. */
    static float num(String key, float fallback) {
        String raw = System.getProperty(key);
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            return Float.parseFloat(raw.trim());
        } catch (NumberFormatException e) {
            log.warn("Ignoring malformed {}={}; using {}", key, raw, fallback);
            return fallback;
        }
    }

    /** Integer-valued knob, e.g. a minimum count. */
    static int count(String key, int fallback) {
        String raw = System.getProperty(key);
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            return Integer.parseInt(raw.trim());
        } catch (NumberFormatException e) {
            log.warn("Ignoring malformed {}={}; using {}", key, raw, fallback);
            return fallback;
        }
    }

    /** Boolean switch; anything other than "true" (any case) reads as false. */
    static boolean flag(String key, boolean fallback) {
        String raw = System.getProperty(key);
        return raw == null ? fallback : Boolean.parseBoolean(raw.trim());
    }

    /** String-valued knob, e.g. an output mode name. */
    static String text(String key, String fallback) {
        return System.getProperty(key, fallback);
    }
}
