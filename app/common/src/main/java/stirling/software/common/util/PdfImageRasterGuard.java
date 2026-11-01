package stirling.software.common.util;

import java.io.IOException;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSDocument;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSObjectKey;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;

/**
 * Rejects any image whose declared raster exceeds {@link #MAX_IMAGE_PIXELS}. PDFBox sizes a raster
 * from the dictionary {@code /Width} and {@code /Height}, and scales an image together with its
 * soft mask ({@code /SMask}) or stencil ({@code /Mask}) to the larger of each dimension, so each
 * image XObject is checked at the combined size. Inline images carry their size in the content
 * stream, so each page's inline images are checked from their parameters as well.
 */
public final class PdfImageRasterGuard {

    public static final long MAX_IMAGE_PIXELS = 100_000_000L;

    private static final COSName[] MASK_KEYS = {COSName.SMASK, COSName.MASK};

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
            for (COSName mask : MASK_KEYS) {
                if (stream.getDictionaryObject(mask) instanceof COSStream m) {
                    width = Math.max(width, m.getInt(COSName.WIDTH, 0));
                    height = Math.max(height, m.getInt(COSName.HEIGHT, 0));
                }
            }
            reject(width, height);
        }
        for (PDPage page : document.getPages()) {
            checkInlineImages(page);
        }
    }

    private static void checkInlineImages(PDPage page) {
        try {
            for (Object token : new PDFStreamParser(page).parse()) {
                if (token instanceof Operator op && op.getImageParameters() != null) {
                    COSDictionary params = op.getImageParameters();
                    reject(
                            inlineDimension(params, COSName.W, COSName.WIDTH),
                            inlineDimension(params, COSName.H, COSName.HEIGHT));
                }
            }
        } catch (IOException e) {
            // A content stream that will not parse is left to the renderer's own limits.
        }
    }

    private static long inlineDimension(COSDictionary params, COSName abbreviated, COSName full) {
        long value = params.getInt(abbreviated, -1);
        return value >= 0 ? value : params.getInt(full, 0);
    }

    private static void reject(long width, long height) {
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
