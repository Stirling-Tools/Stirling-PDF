package stirling.software.SPDF.utils;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

/**
 * Page-orientation detection primitives for the auto-rotate tool.
 *
 * <p>Two independent signals are supported: the dominant direction of a page's embedded text
 * (cheap, digital PDFs only) and Tesseract's orientation-and-script-detection output (works on
 * scans, requires the external binary). Both express their result as the additional clockwise
 * /Rotate correction that makes the page display upright.
 */
public final class AutoRotateDetection {

    private AutoRotateDetection() {}

    /** Glyphs needed to trust the text signal at the ordinary dominance bar. */
    public static final int MIN_GLYPHS = 30;

    /** Fraction of glyphs that must share one direction at the ordinary bar. */
    public static final double MIN_DOMINANCE = 0.95;

    /**
     * Glyphs needed to trust the text signal when the glyphs are near-unanimous. Lets sparse pages
     * (a header, a single line, a rotated URL) be decided from their own text instead of falling
     * through to OSD, as long as effectively every glyph agrees on the direction.
     */
    public static final int MIN_GLYPHS_UNANIMOUS = 8;

    /** Dominance required for the sparse-page path — essentially total agreement. */
    public static final double UNANIMOUS_DOMINANCE = 0.99;

    /**
     * Dominant embedded-text direction of one page.
     *
     * @param dominantDirection glyph direction in page space, degrees CCW (0/90/180/270)
     * @param dominance fraction of counted glyphs sharing the dominant direction (0..1)
     * @param glyphCount number of non-whitespace glyphs counted
     */
    public record TextDirection(int dominantDirection, double dominance, int glyphCount) {

        public boolean isConclusive() {
            if (glyphCount >= MIN_GLYPHS && dominance >= MIN_DOMINANCE) {
                return true;
            }
            return glyphCount >= MIN_GLYPHS_UNANIMOUS && dominance >= UNANIMOUS_DOMINANCE;
        }
    }

    /**
     * Parsed Tesseract OSD verdict.
     *
     * @param rotate clockwise degrees to rotate the rendered page so text is upright
     * @param confidence Tesseract's orientation confidence (same scale OCRmyPDF thresholds on)
     */
    public record OsdResult(int rotate, double confidence) {}

    private static final Pattern OSD_ROTATE =
            Pattern.compile("^Rotate:\\s*(\\d+)", Pattern.MULTILINE);
    private static final Pattern OSD_CONFIDENCE =
            Pattern.compile("^Orientation confidence:\\s*([0-9.]+)", Pattern.MULTILINE);

    /**
     * Counts non-whitespace glyph directions for every page in one pass. A stripper per page would
     * re-walk the document once per page, which is quadratic on long documents; this walks it once
     * and buckets glyphs by the page being processed.
     *
     * @return one entry per page, in page order
     */
    public static List<TextDirection> detectTextDirections(PDDocument document) throws IOException {
        int pageCount = document.getNumberOfPages();
        DirectionCountingStripper stripper = new DirectionCountingStripper(pageCount);
        stripper.setStartPage(1);
        stripper.setEndPage(pageCount);
        stripper.getText(document);

        List<TextDirection> directions = new ArrayList<>(pageCount);
        for (int page = 0; page < pageCount; page++) {
            int[] counts = stripper.counts[page];
            int total = 0;
            int bestIndex = 0;
            for (int i = 0; i < 4; i++) {
                total += counts[i];
                if (counts[i] > counts[bestIndex]) {
                    bestIndex = i;
                }
            }
            double dominance = total == 0 ? 0 : (double) counts[bestIndex] / total;
            directions.add(new TextDirection(bestIndex * 90, dominance, total));
        }
        return directions;
    }

    /**
     * True when a rendered page carries no ink worth analysing. Checked after rendering but before
     * spawning Tesseract, since the process spawn costs far more than the pixel scan and this
     * catches both empty generated pages and scanned blanks (the back of a duplex sheet).
     */
    public static boolean isBlankRender(BufferedImage image) {
        final int darkThreshold = 200; // 8-bit grey; anything lighter counts as paper
        final int step = 4; // subsample: blank pages are uniform, no need for every pixel
        long sampled = 0;
        long dark = 0;
        for (int y = 0; y < image.getHeight(); y += step) {
            for (int x = 0; x < image.getWidth(); x += step) {
                sampled++;
                if ((image.getRGB(x, y) & 0xFF) < darkThreshold) {
                    dark++;
                    // A page needs a meaningful amount of ink before OSD can do anything;
                    // bail out as soon as we know there is enough.
                    if (dark > sampled / 1000 + 20) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    /**
     * Clockwise /Rotate correction for a page whose dominant glyph direction (page space, CCW) is
     * {@code dominantDirection} and whose current /Rotate is {@code pageRotation}. Derivation: the
     * on-screen text angle is (direction - rotation) CCW, and adding d to /Rotate turns the display
     * a further d clockwise, so the correction that zeroes the screen angle is their difference.
     */
    public static int correctionFromTextDirection(int dominantDirection, int pageRotation) {
        return Math.floorMod(dominantDirection - pageRotation, 360);
    }

    /** Extracts rotation and confidence from `tesseract <img> stdout --psm 0` output. */
    public static Optional<OsdResult> parseOsd(String tesseractOutput) {
        if (tesseractOutput == null) {
            return Optional.empty();
        }
        Matcher rotate = OSD_ROTATE.matcher(tesseractOutput);
        Matcher confidence = OSD_CONFIDENCE.matcher(tesseractOutput);
        if (!rotate.find() || !confidence.find()) {
            return Optional.empty();
        }
        try {
            return Optional.of(
                    new OsdResult(
                            Integer.parseInt(rotate.group(1)),
                            Double.parseDouble(confidence.group(1))));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    private static class DirectionCountingStripper extends PDFTextStripper {

        // counts[page][i] holds glyphs on that page whose direction is i * 90 degrees
        final int[][] counts;

        DirectionCountingStripper(int pageCount) throws IOException {
            this.counts = new int[pageCount][4];
        }

        /**
         * PDFBox snaps glyph direction to a quadrant, so getDir() only ever yields 0/90/180/270 —
         * obliquely drawn text (30, 45, 135 degrees) is reported as 0 rather than as its true
         * angle. Skew is therefore invisible to this signal by construction, which is consistent
         * with skew being out of scope here: only 90-degree orientation is corrected.
         */
        @Override
        protected void processTextPosition(TextPosition text) {
            String unicode = text.getUnicode();
            if (unicode == null || unicode.isBlank()) {
                return;
            }
            int page = getCurrentPageNo() - 1;
            if (page < 0 || page >= counts.length) {
                return;
            }
            counts[page][Math.floorMod(Math.round(text.getDir()), 360) / 90]++;
            // super is intentionally not called: we only count, no text assembly needed
        }
    }
}
