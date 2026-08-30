package stirling.software.SPDF.service;

import java.awt.Color;
import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageContentStream.AppendMode;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionGoTo;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDBorderStyleDictionary;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.destination.PDPageFitWidthDestination;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.security.SignatureBox;
import stirling.software.SPDF.model.api.security.SignatureLogoPosition;

/**
 * Draws the signature's appearance onto pages that are not the signed one.
 *
 * <p>A PDF signature has a single widget living on a single page, so "show the signature on every
 * page" cannot mean what it sounds like. What this draws is page content, not a signature: it
 * carries no cryptographic meaning and validators will not report it. It exists so a reader
 * flipping through a long document can see at a glance that it was signed, the same way a
 * hand-signed contract is often initialled on every page.
 *
 * <p>The mark is drawn to match the real signature, since a repeated signature that looks different
 * on each page reads as a rendering fault. What keeps it honest instead is a link annotation:
 * clicking a mark jumps to the page carrying the actual signature, where a reader can open its
 * properties and see who signed and whether it validates.
 *
 * <p>Kept apart from the signing code on purpose. Nothing here may touch the signature dictionary,
 * and separating them makes it hard to blur that line by accident.
 */
@Slf4j
public class SignatureMarkStamper {

    private static final Color BORDER_COLOUR = new Color(150, 150, 150);

    private static final float BORDER_WIDTH = 0.5f;

    private SignatureMarkStamper() {}

    /** Stamps the mark on every page except the signed one, without a logo. */
    public static int stampOtherPages(
            PDDocument document,
            int signedPageIndex,
            SignatureBox box,
            List<SignatureAppearanceLayout.Field> fields)
            throws IOException {
        return stampOtherPages(document, signedPageIndex, box, fields, null);
    }

    /**
     * Stamps the mark on every page except the signed one.
     *
     * @param document the document being signed, already loaded
     * @param signedPageIndex zero-based page holding the real signature, which is skipped
     * @param box where the mark goes, in PDF user space
     * @param fields label/value pairs to draw, as the signature itself shows them
     * @param logo the same logo the signature draws, or {@code null} for text only. Passing it
     *     matters: a mark meant to be indistinguishable from the signature cannot be missing the
     *     logo the signature has.
     * @return how many pages were marked
     */
    public static int stampOtherPages(
            PDDocument document,
            int signedPageIndex,
            SignatureBox box,
            List<SignatureAppearanceLayout.Field> fields,
            SignatureLogoPlacement.Logo logo)
            throws IOException {
        if (box == null || fields == null || fields.isEmpty()) {
            return 0;
        }

        // Same face the visible signature uses, so a mark is not distinguishable from it
        // by its typography.
        PDFont font = new PDType1Font(FontName.TIMES_BOLD);

        // Loaded once and shared by every page. Decoding it inside the loop would not merely
        // repeat work: each call embeds another image object in the document, so a long contract
        // would carry the same logo once per marked page.
        PDImageXObject logoImage = loadLogo(document, logo);

        int stamped = 0;
        PDPage signedPage =
                signedPageIndex >= 0 && signedPageIndex < document.getNumberOfPages()
                        ? document.getPage(signedPageIndex)
                        : null;

        for (int pageIndex = 0; pageIndex < document.getNumberOfPages(); pageIndex++) {
            if (pageIndex == signedPageIndex) {
                continue;
            }
            PDPage page = document.getPage(pageIndex);
            PDRectangle rect = box.toPdfRectangle(page.getMediaBox());

            // The logo takes its strip first, exactly as it does in the signature, so both end up
            // with the text in the same place. This part stays per page: the box lands on each
            // page's own media box, and a document can mix page sizes.
            PDRectangle textArea = rect;
            SignatureLogoPlacement.Placement placement = null;
            if (logoImage != null) {
                placement =
                        SignatureLogoPlacement.place(rect, aspectRatio(logoImage), logo.position());
                textArea = placement.textRect();
            }

            SignatureAppearanceLayout.Layout layout =
                    SignatureAppearanceLayout.fit(
                            fields, font, textArea.getWidth(), textArea.getHeight());
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
                if (placement != null) {
                    SignatureLogoPlacement.draw(
                            cs,
                            logoImage,
                            placement.logoRect(),
                            logo.position() == SignatureLogoPosition.BEHIND);
                }
                SignatureAppearanceLayout.draw(cs, font, textArea, layout);
            }
            if (signedPage != null) {
                addLinkToSignature(page, rect, signedPage);
            }
            stamped++;
        }
        return stamped;
    }

    /**
     * Makes the mark clickable, jumping to the page that holds the real signature.
     *
     * <p>Without this a reader has no way to tell a mark from the signature, nor to reach the
     * signature's properties from the page they happen to be on. A link is used rather than
     * anything signature-shaped precisely because it is inert: it navigates and nothing else.
     */
    private static void addLinkToSignature(PDPage page, PDRectangle rect, PDPage signedPage)
            throws IOException {
        PDAnnotationLink link = new PDAnnotationLink();
        link.setRectangle(rect);

        // No visible border: the mark already draws its own, and the default link border
        // would double it.
        PDBorderStyleDictionary borderStyle = new PDBorderStyleDictionary();
        borderStyle.setWidth(0);
        link.setBorderStyle(borderStyle);

        PDPageFitWidthDestination destination = new PDPageFitWidthDestination();
        destination.setPage(signedPage);

        PDActionGoTo action = new PDActionGoTo();
        action.setDestination(destination);
        link.setAction(action);

        page.getAnnotations().add(link);
    }

    /** Decodes the logo once per page, or nothing when the caller passed none. */
    private static PDImageXObject loadLogo(PDDocument document, SignatureLogoPlacement.Logo logo)
            throws IOException {
        if (logo == null || logo.image() == null || logo.image().length == 0) {
            return null;
        }
        return PDImageXObject.createFromByteArray(document, logo.image(), "signatureMarkLogo");
    }

    private static float aspectRatio(PDImageXObject image) {
        return image.getHeight() == 0 ? 1f : (float) image.getWidth() / (float) image.getHeight();
    }

    private static void drawBorder(PDPageContentStream cs, PDRectangle rect) throws IOException {
        cs.setStrokingColor(BORDER_COLOUR);
        cs.setLineWidth(BORDER_WIDTH);
        cs.addRect(rect.getLowerLeftX(), rect.getLowerLeftY(), rect.getWidth(), rect.getHeight());
        cs.stroke();
    }
}
