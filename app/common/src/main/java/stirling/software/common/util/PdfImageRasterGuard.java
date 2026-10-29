package stirling.software.common.util;

import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDocument;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSObjectKey;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.pdmodel.PDDocument;

/**
 * Rejects any image whose declared pixel count exceeds {@link #MAX_IMAGE_PIXELS}. PDFBox sizes an
 * image's raster from its dictionary {@code /Width} and {@code /Height}, and a soft mask ({@code
 * /SMask}) or stencil ({@code /Mask}) is itself an image object, so every image object is checked
 * directly.
 */
public final class PdfImageRasterGuard {

    public static final long MAX_IMAGE_PIXELS = 100_000_000L;

    private PdfImageRasterGuard() {}

    public static void validate(PDDocument document) {
        COSDocument cos = document.getDocument();
        for (COSObjectKey key : cos.getXrefTable().keySet()) {
            COSBase base = cos.getObjectFromPool(key).getObject();
            if (!(base instanceof COSStream stream)
                    || !COSName.IMAGE.equals(stream.getCOSName(COSName.SUBTYPE))) {
                continue;
            }
            long width = stream.getInt(COSName.WIDTH, 0);
            long height = stream.getInt(COSName.HEIGHT, 0);
            if (width > 0 && height > 0 && width > MAX_IMAGE_PIXELS / height) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.imageDimensionsExceedLimit",
                        "Image dimensions {0}x{1} exceed the maximum of {2} pixels.",
                        width,
                        height,
                        MAX_IMAGE_PIXELS);
            }
        }
    }
}
