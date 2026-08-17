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
 * uploaded, so neither size is known in advance. Two rules keep the result usable at any
 * combination:
 *
 * <ul>
 *   <li>The logo keeps its aspect ratio. Stretching a company logo to fill a strip is worse than
 *       showing it smaller, because a distorted logo looks like a bug in the signature.
 *   <li>Past a floor, the text keeps everything it would have had with the whole box to itself -
 *       every line, and type no more than a quarter smaller. A signature that shows a picture and
 *       no signer is not a signature.
 * </ul>
 *
 * <p>Between those two the logo gets as much as it can, which is the change from a fixed share: one
 * number cannot be right for both a 300pt box with two fields in it and a 60pt one with five, and a
 * middling value gave the first far less than it could have had.
 *
 * <p>The floor is the share that was fixed before, and it is unconditional. Sizing purely by what
 * the text can spare would make a band above a short signature <em>thinner</em> than it used to be,
 * because three fields underneath demand every point of the height - the very case that prompted
 * the change. Below the floor, then, the text still gives way exactly as it always did.
 *
 * <p>{@link SignatureLogoPosition#BEHIND} is the exception to the split: the logo covers the whole
 * box and the text keeps it too, drawn on top.
 */
public final class SignatureLogoPlacement {

    /** Most of the box the logo strip may take, however much room the text turns out to need. */
    private static final float MAX_LOGO_SHARE = 0.5f;

    /**
     * Least the logo strip is given when the text cannot spare even that.
     *
     * <p>This is the share the class used to hand out unconditionally, and keeping it as the floor
     * is deliberate: it makes the new rule a strict improvement, since no box and position can now
     * come out with a smaller logo than it had before.
     *
     * <p>It matters most where the text is hungriest. A band above a short signature has three
     * fields underneath it demanding the height, so a rule that only ever gave the logo what the
     * text could spare would leave it thinner here than the fixed share did - which is precisely
     * the case users complained about. Small is a legible outcome; smaller than before is a
     * regression.
     */
    private static final float MIN_LOGO_SHARE = 0.35f;

    /** How finely the share is searched. Finer than the eye can tell in a signature box. */
    private static final float LOGO_SHARE_STEP = 0.02f;

    /** Gap between the logo strip and the text, as a share of the box's smaller side. */
    private static final float GAP_SHARE = 0.04f;

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
     * Divides the box between logo and text, giving the logo everything the text can spare.
     *
     * @param box the signature box, in page coordinates
     * @param imageAspectRatio image width divided by image height; values that are not positive and
     *     finite fall back to a square, so a broken image never produces a broken layout
     * @param position where the caller asked for the logo
     * @param textFit whether the text is still usable in a candidate area. Passing {@link
     *     SignatureAppearanceLayout.TextFit#ANY} hands the logo the largest strip allowed.
     */
    public static Placement place(
            PDRectangle box,
            float imageAspectRatio,
            SignatureLogoPosition position,
            SignatureAppearanceLayout.TextFit textFit)
            throws IOException {
        float aspect = sanitiseAspect(imageAspectRatio);
        SignatureLogoPosition where = position != null ? position : SignatureLogoPosition.LEFT;

        if (where == SignatureLogoPosition.BEHIND) {
            return new Placement(fitInside(box, aspect), box);
        }

        float gap = Math.min(box.getWidth(), box.getHeight()) * GAP_SHARE;
        boolean beside =
                where == SignatureLogoPosition.LEFT || where == SignatureLogoPosition.RIGHT;
        boolean first = where == SignatureLogoPosition.LEFT || where == SignatureLogoPosition.TOP;

        // Largest share the text tolerates, searched downwards. The chosen position is never
        // second-guessed: what gives is the size, which is what the user can see and adjust.
        for (float share = MAX_LOGO_SHARE; share > MIN_LOGO_SHARE; share -= LOGO_SHARE_STEP) {
            Placement candidate =
                    beside
                            ? placeBeside(box, aspect, gap, first, share)
                            : placeAbove(box, aspect, gap, first, share);
            PDRectangle text = candidate.textRect();
            if (textFit.fits(text.getWidth(), text.getHeight())) {
                return candidate;
            }
        }
        return beside
                ? placeBeside(box, aspect, gap, first, MIN_LOGO_SHARE)
                : placeAbove(box, aspect, gap, first, MIN_LOGO_SHARE);
    }

    /** Logo in a column at one side, text in the rest of the width. */
    private static Placement placeBeside(
            PDRectangle box, float aspect, float gap, boolean logoOnLeft, float share) {
        float maxStripWidth = Math.max(0f, box.getWidth() * share - gap);
        // A tall logo is limited by the box height, a wide one by the share it may take.
        float logoWidth = Math.min(maxStripWidth, box.getHeight() * aspect);
        float logoHeight = aspect > 0 ? logoWidth / aspect : 0f;

        float stripWidth = logoWidth + gap;
        float textWidth =
                Math.max(box.getWidth() * (1f - MAX_LOGO_SHARE), box.getWidth() - stripWidth);

        float logoX =
                logoOnLeft
                        ? box.getLowerLeftX() + (stripWidth - gap - logoWidth) / 2f
                        : box.getUpperRightX() - stripWidth + gap / 2f;
        float textX = logoOnLeft ? box.getUpperRightX() - textWidth : box.getLowerLeftX();

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
            PDRectangle box, float aspect, float gap, boolean logoOnTop, float share) {
        float maxBandHeight = Math.max(0f, box.getHeight() * share - gap);
        // A wide logo is limited by the box width, a tall one by the share it may take.
        float logoHeight = Math.min(maxBandHeight, aspect > 0 ? box.getWidth() / aspect : 0f);
        float logoWidth = logoHeight * aspect;

        float bandHeight = logoHeight + gap;
        float textHeight =
                Math.max(box.getHeight() * (1f - MAX_LOGO_SHARE), box.getHeight() - bandHeight);

        float logoY =
                logoOnTop
                        ? box.getUpperRightY() - bandHeight + gap / 2f
                        : box.getLowerLeftY() + (bandHeight - gap - logoHeight) / 2f;
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
     *     has always used, which is what keeps text readable over it
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
    private static PDRectangle fitInside(PDRectangle box, float aspect) {
        float width = box.getWidth();
        float height = width / aspect;
        if (height > box.getHeight()) {
            height = box.getHeight();
            width = height * aspect;
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
