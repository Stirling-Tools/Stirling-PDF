package stirling.software.SPDF.service.ocr;

/**
 * OCRmyPDF options the in-process engine honours.
 *
 * @param force OCR every page, replacing its content with the rendered image
 * @param deskew straighten skewed pages; a straightened page replaces the original content
 * @param rotatePages fix 90/180/270 page orientation with Tesseract OSD (needs osd.traineddata)
 * @param removeImages drop every image after OCR, leaving the text layer and vector content
 * @param clean remove scan specks from the image Tesseract reads; the page itself is unchanged
 * @param cleanFinal as {@code clean}, and the cleaned image replaces the page
 */
public record OcrOptions(
        boolean force,
        boolean deskew,
        boolean rotatePages,
        boolean removeImages,
        boolean clean,
        boolean cleanFinal) {

    public static final OcrOptions DEFAULT =
            new OcrOptions(false, false, false, false, false, false);

    /** Whether a page's content may be replaced by the image that was OCRed. */
    boolean replacesPages() {
        return force || deskew || cleanFinal;
    }
}
