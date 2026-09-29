package stirling.software.proprietary.formdetection.model;

/**
 * One detected form field, as returned by the detect endpoint.
 *
 * @param type AcroForm field type (text|checkbox|radio|signature)
 * @param page zero-based page index
 * @param rectInPdfPoints rectangle in PDF points (bottom-left origin)
 * @param confidence detection confidence 0-1
 */
public record DetectedField(String type, int page, RectPt rectInPdfPoints, double confidence) {

    /** Rectangle in PDF points, bottom-left origin (PDF user space). */
    public record RectPt(double x, double y, double w, double h) {}
}
