package stirling.software.SPDF.utils;

import java.io.IOException;
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

    /** Minimum glyphs on a page before the embedded-text signal is trusted at all. */
    public static final int MIN_GLYPHS = 30;

    /** Fraction of glyphs that must share one direction for the text signal to be conclusive. */
    public static final double MIN_DOMINANCE = 0.95;

    /**
     * Dominant embedded-text direction of one page.
     *
     * @param dominantDirection glyph direction in page space, degrees CCW (0/90/180/270)
     * @param dominance fraction of counted glyphs sharing the dominant direction (0..1)
     * @param glyphCount number of non-whitespace glyphs counted
     */
    public record TextDirection(int dominantDirection, double dominance, int glyphCount) {

        public boolean isConclusive() {
            return glyphCount >= MIN_GLYPHS && dominance >= MIN_DOMINANCE;
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

    /** Counts non-whitespace glyph directions for a single page. */
    public static TextDirection detectTextDirection(PDDocument document, int pageIndex)
            throws IOException {
        DirectionCountingStripper stripper = new DirectionCountingStripper();
        stripper.setStartPage(pageIndex + 1);
        stripper.setEndPage(pageIndex + 1);
        stripper.getText(document);

        int total = 0;
        int bestIndex = 0;
        for (int i = 0; i < 4; i++) {
            total += stripper.counts[i];
            if (stripper.counts[i] > stripper.counts[bestIndex]) {
                bestIndex = i;
            }
        }
        double dominance = total == 0 ? 0 : (double) stripper.counts[bestIndex] / total;
        return new TextDirection(bestIndex * 90, dominance, total);
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

        // counts[i] holds glyphs whose direction is i * 90 degrees
        final int[] counts = new int[4];

        @Override
        protected void processTextPosition(TextPosition text) {
            String unicode = text.getUnicode();
            if (unicode == null || unicode.isBlank()) {
                return;
            }
            int dir = Math.floorMod(Math.round(text.getDir()), 360);
            if (dir % 90 == 0) {
                counts[dir / 90]++;
            }
            // super is intentionally not called: we only count, no text assembly needed
        }
    }
}
