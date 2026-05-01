package stirling.software.common.util;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Locate text on a specific PDF page and return its bounding box in PDF user-space (bottom-left
 * origin). Used by tools that receive "anchor by text" hints — e.g. {@code
 * /api/v1/misc/add-comments} when callers supply an {@code anchorText} instead of explicit
 * coordinates.
 *
 * <p>Matching is tolerant: case-insensitive with punctuation/whitespace stripped on both sides, so
 * a caller-supplied needle of {@code "215000"} matches page text {@code "$215,000"}, and {@code
 * "Total Revenue"} matches {@code "Total Revenue."}.
 */
@Slf4j
@Component
public class PdfTextLocator {

    /** One found line of text with its user-space bounding box. */
    public record MatchedBox(float x, float y, float width, float height) {}

    /**
     * Find the first line on {@code pageIndex} (0-indexed) whose text contains {@code needle} under
     * the tolerant match. Returns empty when no match, when the page index is out of range, or when
     * the needle is blank.
     */
    public Optional<MatchedBox> findOnPage(PDDocument doc, int pageIndex, String needle) {
        if (doc == null
                || needle == null
                || needle.isBlank()
                || pageIndex < 0
                || pageIndex >= doc.getNumberOfPages()) {
            return Optional.empty();
        }
        String normalizedNeedle = normalize(needle);
        if (normalizedNeedle.isEmpty()) {
            return Optional.empty();
        }

        List<CapturedLine> lines = new ArrayList<>();
        LineCapturingStripper stripper;
        try {
            stripper = new LineCapturingStripper(lines);
            stripper.setStartPage(pageIndex + 1);
            stripper.setEndPage(pageIndex + 1);
            stripper.setSortByPosition(true);
            // Side effect: populates `lines`. We don't need the concatenated text.
            stripper.getText(doc);
        } catch (IOException e) {
            log.warn(
                    "PdfTextLocator failed to extract text on page {}: {}",
                    pageIndex,
                    e.getMessage());
            return Optional.empty();
        }

        PDRectangle mediaBox = doc.getPage(pageIndex).getMediaBox();
        float pageHeight = mediaBox.getHeight();

        for (CapturedLine line : lines) {
            if (normalize(line.text).contains(normalizedNeedle)) {
                // PDFBox's *DirAdj coords descend from the top of the page; convert to PDF
                // user-space (origin = bottom-left) so the bbox can feed a PDRectangle directly.
                float userSpaceY = pageHeight - line.yTopDown - line.height;
                return Optional.of(new MatchedBox(line.x, userSpaceY, line.width, line.height));
            }
        }
        return Optional.empty();
    }

    /** Strip everything non-alphanumeric and lowercase for tolerant matching. */
    private static String normalize(String s) {
        return s.replaceAll("[^A-Za-z0-9]", "").toLowerCase(Locale.ROOT);
    }

    private static final class CapturedLine {
        String text;
        float x;
        float yTopDown;
        float width;
        float height;
    }

    private static final class LineCapturingStripper extends PDFTextStripper {
        private final List<CapturedLine> lines;

        LineCapturingStripper(List<CapturedLine> sink) throws IOException {
            super();
            this.lines = sink;
        }

        @Override
        protected void writeString(String text, List<TextPosition> textPositions)
                throws IOException {
            if (textPositions != null && !textPositions.isEmpty()) {
                CapturedLine line = new CapturedLine();
                line.text = text;

                float minX = Float.MAX_VALUE;
                float maxRight = 0f;
                float minY = Float.MAX_VALUE;
                float maxHeight = 0f;
                for (TextPosition p : textPositions) {
                    float x = p.getXDirAdj();
                    float y = p.getYDirAdj();
                    float w = p.getWidthDirAdj();
                    float h = p.getHeightDir();
                    if (h == 0f) {
                        // Workaround: some fonts report 0 height via TextPosition; fall back to
                        // the nominal font size so downstream bboxes are never zero-height.
                        h = p.getFontSizeInPt();
                    }
                    if (x < minX) minX = x;
                    if (x + w > maxRight) maxRight = x + w;
                    if (y < minY) minY = y;
                    if (h > maxHeight) maxHeight = h;
                }
                line.x = minX;
                line.width = maxRight - minX;
                line.yTopDown = minY;
                line.height = maxHeight;
                lines.add(line);
            }
            super.writeString(text, textPositions);
        }
    }
}
