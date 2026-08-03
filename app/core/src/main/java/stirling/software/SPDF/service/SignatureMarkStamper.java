package stirling.software.SPDF.service;

import java.awt.Color;
import java.io.IOException;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageContentStream.AppendMode;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.security.SignatureBox;

/**
 * Draws the signature's appearance onto pages that are not the signed one.
 *
 * <p>A PDF signature has a single widget living on a single page, so "show the signature on every
 * page" cannot mean what it sounds like. What this draws is page content, not a signature: it
 * carries no cryptographic meaning and validators will not report it. It exists so a reader
 * flipping through a long document can see at a glance that it was signed, the same way a
 * hand-signed contract is often initialled on every page.
 *
 * <p>Kept apart from the signing code on purpose. Nothing here may touch the signature dictionary,
 * and separating them makes it hard to blur that line by accident.
 */
@Slf4j
public class SignatureMarkStamper {

    /** Drawn in grey rather than black so a mark does not read as the real signature. */
    private static final Color TEXT_COLOUR = new Color(90, 90, 90);

    private static final Color BORDER_COLOUR = new Color(150, 150, 150);

    private static final float BORDER_WIDTH = 0.5f;

    private SignatureMarkStamper() {}

    /**
     * Stamps the mark on every page except the signed one.
     *
     * @param document the document being signed, already loaded
     * @param signedPageIndex zero-based page holding the real signature, which is skipped
     * @param box where the mark goes, in PDF user space
     * @param lines label/value pairs to draw, as the signature itself shows them
     * @return how many pages were marked
     */
    public static int stampOtherPages(
            PDDocument document, int signedPageIndex, SignatureBox box, Map<String, String> lines)
            throws IOException {
        if (box == null || lines == null || lines.isEmpty()) {
            return 0;
        }

        PDFont font = new PDType1Font(FontName.HELVETICA);
        int stamped = 0;

        for (int pageIndex = 0; pageIndex < document.getNumberOfPages(); pageIndex++) {
            if (pageIndex == signedPageIndex) {
                continue;
            }
            PDPage page = document.getPage(pageIndex);
            PDRectangle rect = box.toPdfRectangle(page.getMediaBox());

            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(lines, font, rect.getWidth(), rect.getHeight());
            if (layout.lines().isEmpty()) {
                // Pages smaller than the box can leave no room at all; skipping one page is
                // better than drawing something illegible over its content.
                log.debug("No room for the signature mark on page {}", pageIndex + 1);
                continue;
            }

            // AppendMode.APPEND leaves the existing page content untouched underneath.
            try (PDPageContentStream cs =
                    new PDPageContentStream(document, page, AppendMode.APPEND, true, true)) {
                drawBorder(cs, rect);
                drawLines(cs, font, rect, layout);
            }
            stamped++;
        }
        return stamped;
    }

    private static void drawBorder(PDPageContentStream cs, PDRectangle rect) throws IOException {
        cs.setStrokingColor(BORDER_COLOUR);
        cs.setLineWidth(BORDER_WIDTH);
        cs.addRect(rect.getLowerLeftX(), rect.getLowerLeftY(), rect.getWidth(), rect.getHeight());
        cs.stroke();
    }

    private static void drawLines(
            PDPageContentStream cs,
            PDFont font,
            PDRectangle rect,
            SignatureAppearanceLayout.Layout layout)
            throws IOException {
        cs.beginText();
        cs.setFont(font, layout.fontSize());
        cs.setNonStrokingColor(TEXT_COLOUR);
        cs.newLineAtOffset(
                rect.getLowerLeftX() + layout.padding(),
                rect.getUpperRightY() - layout.firstBaselineFromTop());
        cs.setLeading(layout.leading());
        for (int i = 0; i < layout.lines().size(); i++) {
            if (i > 0) {
                cs.newLine();
            }
            cs.showText(layout.lines().get(i));
        }
        cs.endText();
    }
}
