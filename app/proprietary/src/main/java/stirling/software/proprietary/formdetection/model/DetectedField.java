package stirling.software.proprietary.formdetection.model;

/**
 * One detected form field. This is the shared schema returned by both the server detect endpoint
 * and the in-browser pipeline so the two paths are interchangeable.
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
