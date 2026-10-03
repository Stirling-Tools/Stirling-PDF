package stirling.software.SPDF.service;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.blend.BlendMode;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;

import stirling.software.SPDF.model.api.security.SignatureLogoPosition;

/**
 * Splits a signature box between the logo and the text.
 *
 * <p>The box is whatever the user dragged on the page, and the logo is whatever image they
 * uploaded, so neither size is known in advance. The logo is given the largest strip its shape can
 * use, and the text takes the whole of the rest: {@link SignatureAppearanceLayout} sizes the type
 * to whatever area it is handed, so a strip taken here costs the text no field and no legibility,
 * only a different type size.
 *
 * <p>Two limits shape the result. The logo keeps its aspect ratio, because a company logo stretched
 * to fill a strip looks like a bug in the signature. And the strip stops at half the box, because a
 * wide logo asked to match the height of a short box would otherwise want more width than the box
 * has and leave the signature with a picture and no signer.
 *
 * <p>{@link SignatureLogoPosition#BEHIND} is the exception to the split: the logo covers the whole
 * box and the text keeps it too, drawn on top.
 */
public final class SignatureLogoPlacement {

    /** Most of the box the logo strip may take, whatever the shape of the image. */
    private static final float MAX_LOGO_SHARE = 0.5f;

    /** Gap between the logo strip and the text, as a share of the box's smaller side. */
    private static final float GAP_SHARE = 0.04f;

    /**
     * Margin between the logo and the edges of the box, as a share of the box's smaller side.
     *
     * <p>A logo drawn hard against the edge has nothing to lose to rounding, and viewers do round:
     * the appearance stream is clipped to exactly the box, and the mark stamped on the other pages
     * draws its border down the same line. Either will shave a row of pixels off an image that
     * touches it, which is what a cropped logo looks like to the person who uploaded it.
     *
     * <p>It matches the margin {@link SignatureAppearanceLayout} leaves around the text, so the
     * logo and the fields sit on one optical margin rather than two.
     */
    private static final float EDGE_INSET_SHARE = 0.04f;

    private SignatureLogoPlacement() {}

    /**
     * Where the logo and the text go inside the box.
     *
     * @param logoRect area the image is drawn into, already sized to the image's aspect ratio
     * @param textRect area left for the certificate fields
     */
    public record Placement(PDRectangle logoRect, PDRectangle textRect) {}

    /**
     * A logo the caller supplied, carried as raw bytes so the same image can be drawn into the
     * signature and into the marks on the other pages without decoding it twice at the call site.
     *
     * @param image PNG or JPEG bytes
     * @param position where it goes inside the box
     */
    public record Logo(byte[] image, SignatureLogoPosition position) {}

    /**
     * Divides the box between logo and text.
     *
     * @param box the signature box, in page coordinates
     * @param imageAspectRatio image width divided by image height; values that are not positive and
     *     finite fall back to a square, so a broken image never produces a broken layout
     * @param position where the caller asked for the logo
     */
    public static Placement place(
            PDRectangle box, float imageAspectRatio, SignatureLogoPosition position) {
        float aspect = sanitiseAspect(imageAspectRatio);
        SignatureLogoPosition where = position != null ? position : SignatureLogoPosition.LEFT;

        if (where == SignatureLogoPosition.BEHIND) {
            return new Placement(fitInside(box, aspect), box);
        }

        float shorter = Math.min(box.getWidth(), box.getHeight());
        float gap = shorter * GAP_SHARE;
        float inset = shorter * EDGE_INSET_SHARE;
        boolean first = where == SignatureLogoPosition.LEFT || where == SignatureLogoPosition.TOP;

        return where == SignatureLogoPosition.LEFT || where == SignatureLogoPosition.RIGHT
                ? placeBeside(box, aspect, gap, inset, first)
                : placeAbove(box, aspect, gap, inset, first);
    }

    /** Logo in a column at one side, text in the rest of the width. */
    private static Placement placeBeside(
            PDRectangle box, float aspect, float gap, float inset, boolean logoOnLeft) {
        float maxStripWidth = Math.max(0f, box.getWidth() * MAX_LOGO_SHARE - gap - inset);
        // A tall logo is limited by the box height, a wide one by the share it may take.
        float logoWidth =
                Math.min(maxStripWidth, Math.max(0f, box.getHeight() - 2 * inset) * aspect);
        float logoHeight = logoWidth / aspect;

        float textWidth = Math.max(0f, box.getWidth() - inset - logoWidth - gap);

        float logoX =
                logoOnLeft ? box.getLowerLeftX() + inset : box.getUpperRightX() - inset - logoWidth;
        float textX =
                logoOnLeft ? box.getLowerLeftX() + inset + logoWidth + gap : box.getLowerLeftX();

        return new Placement(
                new PDRectangle(
                        logoX,
                        box.getLowerLeftY() + (box.getHeight() - logoHeight) / 2f,
                        logoWidth,
                        logoHeight),
                new PDRectangle(textX, box.getLowerLeftY(), textWidth, box.getHeight()));
    }

    /** Logo in a band at the top or bottom, text in the rest of the height. */
    private static Placement placeAbove(
            PDRectangle box, float aspect, float gap, float inset, boolean logoOnTop) {
        float maxBandHeight = Math.max(0f, box.getHeight() * MAX_LOGO_SHARE - gap - inset);
        // A wide logo is limited by the box width, a tall one by the share it may take.
        float logoHeight =
                Math.min(maxBandHeight, Math.max(0f, box.getWidth() - 2 * inset) / aspect);
        float logoWidth = logoHeight * aspect;

        float textHeight = Math.max(0f, box.getHeight() - inset - logoHeight - gap);

        float logoY =
                logoOnTop ? box.getUpperRightY() - inset - logoHeight : box.getLowerLeftY() + inset;
        float textY = logoOnTop ? box.getLowerLeftY() : box.getUpperRightY() - textHeight;

        return new Placement(
                new PDRectangle(
                        box.getLowerLeftX() + (box.getWidth() - logoWidth) / 2f,
                        logoY,
                        logoWidth,
                        logoHeight),
                new PDRectangle(box.getLowerLeftX(), textY, box.getWidth(), textHeight));
    }

    /**
     * Draws the logo into the area {@link #place} worked out.
     *
     * <p>Lives next to the placement rules so the visible signature and the marks stamped on the
     * other pages cannot drift apart in how they render the same image.
     *
     * @param watermark true for {@link SignatureLogoPosition#BEHIND}, where the text is drawn on
     *     top afterwards: the image is multiplied at half opacity, the treatment the bundled mark
     *     has always had, which is what keeps text readable over it
     */
    public static void draw(
            PDPageContentStream cs, PDImageXObject image, PDRectangle area, boolean watermark)
            throws IOException {
        if (area.getWidth() <= 0 || area.getHeight() <= 0) {
            return;
        }
        cs.saveGraphicsState();
        if (watermark) {
            PDExtendedGraphicsState extState = new PDExtendedGraphicsState();
            extState.setBlendMode(BlendMode.MULTIPLY);
            extState.setNonStrokingAlphaConstant(0.5f);
            cs.setGraphicsStateParameters(extState);
        }
        cs.drawImage(
                image,
                area.getLowerLeftX(),
                area.getLowerLeftY(),
                area.getWidth(),
                area.getHeight());
        cs.restoreGraphicsState();
    }

    /** Largest rectangle of the given aspect ratio that fits the box, centred in it. */
    public static PDRectangle fitInside(PDRectangle box, float aspect) {
        float safeAspect = sanitiseAspect(aspect);
        float width = box.getWidth();
        float height = width / safeAspect;
        if (height > box.getHeight()) {
            height = box.getHeight();
            width = height * safeAspect;
        }
        return new PDRectangle(
                box.getLowerLeftX() + (box.getWidth() - width) / 2f,
                box.getLowerLeftY() + (box.getHeight() - height) / 2f,
                width,
                height);
    }

    private static float sanitiseAspect(float imageAspectRatio) {
        if (!Float.isFinite(imageAspectRatio) || imageAspectRatio <= 0f) {
            return 1f;
        }
        return imageAspectRatio;
    }
}
