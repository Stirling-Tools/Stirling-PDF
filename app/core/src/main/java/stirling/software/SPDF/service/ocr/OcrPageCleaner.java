package stirling.software.SPDF.service.ocr;

import static org.bytedeco.leptonica.global.leptonica.L_SELECT_IF_LTE;
import static org.bytedeco.leptonica.global.leptonica.boxCreate;
import static org.bytedeco.leptonica.global.leptonica.boxDestroy;
import static org.bytedeco.leptonica.global.leptonica.pixConvertRGBToLuminance;
import static org.bytedeco.leptonica.global.leptonica.pixCountPixelsInRect;
import static org.bytedeco.leptonica.global.leptonica.pixDestroy;
import static org.bytedeco.leptonica.global.leptonica.pixGetDepth;
import static org.bytedeco.leptonica.global.leptonica.pixGetHeight;
import static org.bytedeco.leptonica.global.leptonica.pixGetRankValue;
import static org.bytedeco.leptonica.global.leptonica.pixGetWidth;
import static org.bytedeco.leptonica.global.leptonica.pixSelectByArea;
import static org.bytedeco.leptonica.global.leptonica.pixSetInRectArbitrary;
import static org.bytedeco.leptonica.global.leptonica.pixSetMasked;
import static org.bytedeco.leptonica.global.leptonica.pixSubtract;
import static org.bytedeco.leptonica.global.leptonica.pixThresholdToBinary;

import org.bytedeco.javacpp.IntPointer;
import org.bytedeco.leptonica.BOX;
import org.bytedeco.leptonica.PIX;

/**
 * OCRmyPDF's {@code --clean}, in-process. OCRmyPDF runs unpaper with layout none and its deskew,
 * black, grey, border-align and mask-centre steps turned off; with no scan points its mask scan
 * then finds nothing. Two filters remain, reproduced here:
 *
 * <ul>
 *   <li>the noise filter clears isolated specks of at most {@value #SPECK_PIXELS} dark pixels;
 *   <li>the blur filter clears {@value #BLOCK} px blocks that, with their neighbours, are at most
 *       1% dark, wiping stray marks in otherwise empty areas.
 * </ul>
 *
 * Dark means below unpaper's white threshold, 90% of white. unpaper counts in the scan's own
 * pixels, so its sizes are scaled from the scan's resolution to the one the page is rendered at: a
 * 200 DPI speck upsampled for Tesseract is still a speck. One deliberate difference: unpaper paints
 * what it clears pure white, which leaves white patches and a grey frame round the text on a scan
 * of grey paper; here cleared areas take the page's paper colour instead.
 */
final class OcrPageCleaner {

    private static final int DARK_BELOW = 229;
    private static final int SPECK_PIXELS = 4;
    private static final int BLOCK = 100;
    private static final double BLOCK_INK = 0.01;

    private OcrPageCleaner() {}

    /** Cleans {@code pix}, 8 or 32 bpp rendered at {@code dpi} from a {@code sourceDpi} scan. */
    static void clean(PIX pix, int dpi, int sourceDpi) {
        PIX luminance = pixGetDepth(pix) == 32 ? pixConvertRGBToLuminance(pix) : null;
        PIX dark = pixThresholdToBinary(luminance != null ? luminance : pix, DARK_BELOW);
        if (luminance != null) pixDestroy(luminance);
        if (dark == null) return;
        try {
            double scale = (double) dpi / sourceDpi;
            int paper = paper(pix);
            removeSpecks(pix, dark, (float) (SPECK_PIXELS * scale * scale), paper);
            clearSparseBlocks(pix, dark, Math.max(1, (int) Math.round(BLOCK * scale)), paper);
        } finally {
            pixDestroy(dark);
        }
    }

    /** The page's median colour, or white when that is dark: most of a text page is paper. */
    private static int paper(PIX pix) {
        boolean colour = pixGetDepth(pix) == 32;
        int white = colour ? 0xffffff00 : 0xff;
        IntPointer median = new IntPointer(1);
        if (pixGetRankValue(pix, 4, 0.5f, median) != 0) return white;
        int value = median.get();
        int luma =
                colour
                        ? ((value >>> 24) * 299
                                        + ((value >>> 16) & 0xff) * 587
                                        + ((value >>> 8) & 0xff) * 114)
                                / 1000
                        : value;
        return luma >= DARK_BELOW ? value : white;
    }

    private static void removeSpecks(PIX pix, PIX dark, float maxPixels, int paper) {
        PIX specks = pixSelectByArea(dark, maxPixels, 8, L_SELECT_IF_LTE, (IntPointer) null);
        if (specks == null) return;
        if (specks.address() == dark.address()) {
            // JavaCPP hands back the same object for the same address; release the extra reference.
            pixDestroy(new PIX(specks));
            return;
        }
        // The specks also leave the mask the blur filter reads next.
        pixSetMasked(pix, specks, paper);
        pixSubtract(dark, dark, specks);
        pixDestroy(specks);
    }

    private static void clearSparseBlocks(PIX pix, PIX dark, int block, int paper) {
        int cols = pixGetWidth(dark) / block;
        int rows = pixGetHeight(dark) / block;
        if (cols == 0 || rows == 0) return;
        int[][] ink = new int[rows][cols];
        IntPointer count = new IntPointer(1);
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                BOX box = boxCreate(c * block, r * block, block, block);
                pixCountPixelsInRect(dark, box, count, null);
                ink[r][c] = count.get();
                boxDestroy(box);
            }
        }
        long limit = (long) (BLOCK_INK * block * block);
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                if (densestAround(ink, r, c) > limit) continue;
                BOX box = boxCreate(c * block, r * block, block, block);
                pixSetInRectArbitrary(pix, box, paper);
                boxDestroy(box);
            }
        }
    }

    private static int densestAround(int[][] ink, int row, int col) {
        int max = 0;
        for (int r = Math.max(0, row - 1); r <= Math.min(ink.length - 1, row + 1); r++) {
            for (int c = Math.max(0, col - 1); c <= Math.min(ink[r].length - 1, col + 1); c++) {
                max = Math.max(max, ink[r][c]);
            }
        }
        return max;
    }
}
