package stirling.software.SPDF.service.ocr;

/**
 * OCRmyPDF options the in-process engine honours. {@code clean} and {@code cleanFinal} have no
 * equivalent (they need unpaper) and are not represented.
 *
 * @param force OCR every page, replacing its content with the rendered image
 * @param deskew straighten skewed pages; a straightened page replaces the original content
 * @param rotatePages fix 90/180/270 page orientation with Tesseract OSD (needs osd.traineddata)
 * @param removeImages drop every image after OCR, leaving the text layer and vector content
 */
public record OcrOptions(boolean force, boolean deskew, boolean rotatePages, boolean removeImages) {

    public static final OcrOptions DEFAULT = new OcrOptions(false, false, false, false);
}
