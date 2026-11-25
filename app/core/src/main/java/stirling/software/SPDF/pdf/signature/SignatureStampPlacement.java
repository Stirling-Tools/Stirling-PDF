package stirling.software.SPDF.pdf.signature;

import java.io.IOException;
import java.util.Locale;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;

import io.micrometer.common.util.StringUtils;

import stirling.software.common.util.ExceptionUtils;

/**
 * Where a visible signature goes: a page, a rectangle in that page's default user space (PDF
 * points, origin bottom-left, before /Rotate), the page's rotation, and the empty signature field
 * to sign into when there is one.
 */
public record SignatureStampPlacement(
        int pageIndex, PDRectangle rectangle, int rotation, PDSignatureField field) {

    static final float DEFAULT_WIDTH = 200;
    static final float DEFAULT_HEIGHT = 50;
    static final float DEFAULT_MARGIN = 36;

    // Coordinates from a viewer arrive as rounded floats; a box drawn flush to the page edge
    // must not be rejected for overhanging it by a fraction of a point.
    private static final float EDGE_TOLERANCE = 0.5f;

    /** A box in default user space; build it with {@link #of} so a partial box is rejected. */
    public record Box(float x, float y, float width, float height) {

        /**
         * Null when all four are null; a 400 when only some are given or the size is not positive.
         */
        public static Box of(Float x, Float y, Float width, Float height) {
            if (x == null && y == null && width == null && height == null) {
                return null;
            }
            if (x == null || y == null || width == null || height == null) {
                throw invalid("x, y, width and height - give all four, or none of them");
            }
            if (!Float.isFinite(x)
                    || !Float.isFinite(y)
                    || !Float.isFinite(width)
                    || !Float.isFinite(height)) {
                throw invalid("x, y, width and height - each must be a finite number");
            }
            if (width <= 0 || height <= 0) {
                throw invalid("width and height - the signature box needs a positive size");
            }
            return new Box(x, y, width, height);
        }
    }

    /**
     * Resolves the placement: the named empty signature field when {@code fieldName} is set,
     * otherwise {@code box} on {@code pageIndex} (0-based, null for the first page), otherwise a
     * default box inset from the bottom-right corner of the visible page.
     */
    public static SignatureStampPlacement resolve(
            PDDocument doc, Integer pageIndex, Box box, String fieldName) {
        if (StringUtils.isNotBlank(fieldName)) {
            if (box != null) {
                throw invalid(
                        "fieldName - a signature field already has its own box, so leave x, y,"
                                + " width and height out");
            }
            return inField(doc, fieldName);
        }
        int index = checkPage(pageIndex, doc.getNumberOfPages());
        PDPage page = doc.getPage(index);
        int rotation = rotationOf(page);
        PDRectangle cropBox = page.getCropBox();
        PDRectangle rectangle =
                box == null
                        ? defaultRectangle(cropBox, rotation)
                        : checkInside(box, cropBox, index);
        return new SignatureStampPlacement(index, rectangle, rotation, null);
    }

    public float visibleWidth() {
        return quarterTurned() ? rectangle.getHeight() : rectangle.getWidth();
    }

    public float visibleHeight() {
        return quarterTurned() ? rectangle.getWidth() : rectangle.getHeight();
    }

    private boolean quarterTurned() {
        return rotation == 90 || rotation == 270;
    }

    static PDRectangle defaultRectangle(PDRectangle cropBox, int rotation) {
        boolean quarterTurned = rotation == 90 || rotation == 270;
        float pageWidth = quarterTurned ? cropBox.getHeight() : cropBox.getWidth();
        float pageHeight = quarterTurned ? cropBox.getWidth() : cropBox.getHeight();
        float width = Math.min(DEFAULT_WIDTH, pageWidth);
        float height = Math.min(DEFAULT_HEIGHT, pageHeight);
        float marginX = Math.min(DEFAULT_MARGIN, (pageWidth - width) / 2);
        float marginY = Math.min(DEFAULT_MARGIN, (pageHeight - height) / 2);
        return toUserSpace(cropBox, rotation, pageWidth - marginX - width, marginY, width, height);
    }

    /**
     * Maps a box measured on the page as displayed (after /Rotate, origin at the visible
     * bottom-left corner) into default user space.
     */
    static PDRectangle toUserSpace(
            PDRectangle cropBox, int rotation, float x, float y, float width, float height) {
        float left = cropBox.getLowerLeftX();
        float bottom = cropBox.getLowerLeftY();
        float right = cropBox.getUpperRightX();
        float top = cropBox.getUpperRightY();
        return switch (rotation) {
            case 90 -> new PDRectangle(right - y - height, bottom + x, height, width);
            case 180 -> new PDRectangle(right - x - width, top - y - height, width, height);
            case 270 -> new PDRectangle(left + y, top - x - width, height, width);
            default -> new PDRectangle(left + x, bottom + y, width, height);
        };
    }

    private static PDRectangle checkInside(Box box, PDRectangle cropBox, int pageIndex) {
        boolean inside =
                box.x() >= cropBox.getLowerLeftX() - EDGE_TOLERANCE
                        && box.y() >= cropBox.getLowerLeftY() - EDGE_TOLERANCE
                        && box.x() + box.width() <= cropBox.getUpperRightX() + EDGE_TOLERANCE
                        && box.y() + box.height() <= cropBox.getUpperRightY() + EDGE_TOLERANCE;
        if (!inside) {
            throw invalid(
                    String.format(
                            Locale.ROOT,
                            "x, y, width and height - the signature box (%.1f, %.1f, %.1f x %.1f)"
                                    + " falls outside page %d, whose visible area runs from"
                                    + " (%.1f, %.1f) to (%.1f, %.1f)",
                            box.x(),
                            box.y(),
                            box.width(),
                            box.height(),
                            pageIndex + 1,
                            cropBox.getLowerLeftX(),
                            cropBox.getLowerLeftY(),
                            cropBox.getUpperRightX(),
                            cropBox.getUpperRightY()));
        }
        PDRectangle rectangle = new PDRectangle(box.x(), box.y(), box.width(), box.height());
        if (rectangle.getWidth() <= 0
                || rectangle.getHeight() <= 0
                || !overlaps(rectangle, cropBox)) {
            throw invalid(
                    String.format(
                            Locale.ROOT,
                            "x, y, width and height - the signature box (%.1f, %.1f, %.1f x %.1f)"
                                    + " has no visible area on page %d",
                            box.x(),
                            box.y(),
                            box.width(),
                            box.height(),
                            pageIndex + 1));
        }
        return rectangle;
    }

    private static boolean overlaps(PDRectangle box, PDRectangle cropBox) {
        float width =
                Math.min(box.getUpperRightX(), cropBox.getUpperRightX())
                        - Math.max(box.getLowerLeftX(), cropBox.getLowerLeftX());
        float height =
                Math.min(box.getUpperRightY(), cropBox.getUpperRightY())
                        - Math.max(box.getLowerLeftY(), cropBox.getLowerLeftY());
        return width > 0 && height > 0;
    }

    private static SignatureStampPlacement inField(PDDocument doc, String fieldName) {
        PDAcroForm form = doc.getDocumentCatalog().getAcroForm(null);
        PDField field = form == null ? null : form.getField(fieldName);
        if (!(field instanceof PDSignatureField signatureField)) {
            throw invalid(
                    "fieldName " + fieldName + " - the PDF has no signature field by that name");
        }
        if (signatureField.getSignature() != null) {
            throw invalid("fieldName " + fieldName + " - that signature field is already signed");
        }
        PDAnnotationWidget widget =
                signatureField.getWidgets().isEmpty()
                        ? null
                        : signatureField.getWidgets().getFirst();
        PDRectangle rectangle = widget == null ? null : normalised(widget.getRectangle());
        if (rectangle == null || rectangle.getWidth() <= 0 || rectangle.getHeight() <= 0) {
            throw invalid(
                    "fieldName " + fieldName + " - that signature field has no box on a page");
        }
        int index = pageIndexOf(doc, widget);
        if (index < 0) {
            throw invalid("fieldName " + fieldName + " - that signature field is not on any page");
        }
        if (!overlaps(rectangle, doc.getPage(index).getCropBox())) {
            throw invalid(
                    "fieldName "
                            + fieldName
                            + " - that signature field lies outside the visible page");
        }
        return new SignatureStampPlacement(
                index, rectangle, rotationOf(doc.getPage(index)), signatureField);
    }

    private static PDRectangle normalised(PDRectangle rectangle) {
        if (rectangle == null) {
            return null;
        }
        float left = Math.min(rectangle.getLowerLeftX(), rectangle.getUpperRightX());
        float bottom = Math.min(rectangle.getLowerLeftY(), rectangle.getUpperRightY());
        return new PDRectangle(
                left, bottom, Math.abs(rectangle.getWidth()), Math.abs(rectangle.getHeight()));
    }

    // A widget's /P is optional, so fall back to finding it in a page's /Annots.
    private static int pageIndexOf(PDDocument doc, PDAnnotationWidget widget) {
        PDPage page = widget.getPage();
        if (page != null) {
            int index = doc.getPages().indexOf(page);
            if (index >= 0) {
                return index;
            }
        }
        for (int index = 0; index < doc.getNumberOfPages(); index++) {
            try {
                for (PDAnnotation annotation : doc.getPage(index).getAnnotations()) {
                    if (annotation.getCOSObject() == widget.getCOSObject()) {
                        return index;
                    }
                }
            } catch (IOException e) {
                throw invalid("fieldName - page " + (index + 1) + " has unreadable annotations");
            }
        }
        return -1;
    }

    private static int rotationOf(PDPage page) {
        return Math.floorMod(Math.round(page.getRotation() / 90f) * 90, 360);
    }

    private static int checkPage(Integer pageIndex, int pageCount) {
        int index = pageIndex == null ? 0 : pageIndex;
        if (index < 0 || index >= pageCount) {
            throw invalid(
                    "pageNumber "
                            + (index + 1)
                            + " - the visible signature needs a page from 1 to "
                            + pageCount);
        }
        return index;
    }

    private static IllegalArgumentException invalid(String detail) {
        return ExceptionUtils.createIllegalArgumentException(
                "error.invalidArgument", "Invalid argument: {0}", detail);
    }
}
