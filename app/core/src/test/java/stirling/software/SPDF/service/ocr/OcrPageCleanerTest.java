package stirling.software.SPDF.service.ocr;

import static org.bytedeco.leptonica.global.leptonica.pixCreate;
import static org.bytedeco.leptonica.global.leptonica.pixDestroy;
import static org.bytedeco.leptonica.global.leptonica.pixGetPixel;
import static org.bytedeco.leptonica.global.leptonica.pixSetAllArbitrary;
import static org.bytedeco.leptonica.global.leptonica.pixSetPixel;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import org.bytedeco.javacpp.IntPointer;
import org.bytedeco.leptonica.PIX;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class OcrPageCleanerTest {

    private static final int PAPER = 240;
    private static final int INK = 30;

    @BeforeAll
    static void natives() {
        assumeTrue(NativeTesseractService.nativesPackaged(), "no Leptonica natives here");
    }

    @Test
    void clearsSpecksAndSparseAreasButKeepsTextAndMarksBesideIt() {
        // 600 px square on grey paper at 300 DPI, so blocks are 100 px.
        PIX pix = pixCreate(600, 600, 8);
        try {
            pixSetAllArbitrary(pix, PAPER);
            fill(pix, 0, 0, 200, 100, true); // "text" in the top-left blocks
            fill(pix, 250, 50, 2, 2, false); // speck beside the text
            fill(pix, 250, 120, 6, 6, false); // larger mark beside the text
            fill(pix, 450, 350, 6, 6, false); // larger mark in an empty area

            OcrPageCleaner.clean(pix, 300, 300);

            assertEquals(INK, value(pix, 0, 0), "text");
            assertEquals(PAPER, value(pix, 250, 50), "the speck goes (noise filter)");
            assertEquals(INK, value(pix, 252, 122), "a mark beside text stays");
            assertEquals(PAPER, value(pix, 452, 352), "a mark in empty paper goes (blur filter)");
        } finally {
            pixDestroy(pix);
        }
    }

    @Test
    void sizesFollowTheScanResolution() {
        // A 200 DPI scan rendered at 300: a 3x3 mark is a 2x2 speck of the scan, so it goes.
        PIX pix = pixCreate(600, 600, 8);
        try {
            pixSetAllArbitrary(pix, PAPER);
            fill(pix, 0, 0, 300, 150, true);
            fill(pix, 360, 60, 3, 3, false);

            OcrPageCleaner.clean(pix, 300, 200);

            assertEquals(PAPER, value(pix, 361, 61));
        } finally {
            pixDestroy(pix);
        }
    }

    /** Solid ink, or striped like lines of text so its blocks are dark but not black. */
    private static void fill(PIX pix, int x, int y, int w, int h, boolean striped) {
        for (int j = y; j < y + h; j++) {
            if (striped && (j / 4) % 2 == 1) continue;
            for (int i = x; i < x + w; i++) pixSetPixel(pix, i, j, INK);
        }
    }

    private static int value(PIX pix, int x, int y) {
        IntPointer value = new IntPointer(1);
        pixGetPixel(pix, x, y, value);
        return value.get();
    }
}
