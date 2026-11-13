package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.image.BufferedImage;

import org.junit.jupiter.api.Test;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;

class PdfiumWarmUpServiceTest {

    @Test
    void samplePdfRendersTextThroughPdfium() throws Exception {
        try (PdfDocument document = PdfDocument.open(PdfiumWarmUpService.samplePdf());
                PdfPage page = document.page(0)) {
            assertEquals(1, document.pageCount());
            BufferedImage image = page.renderImage(72);
            assertTrue(hasInk(image));
        }
    }

    @Test
    void runDoesNotThrow() {
        PdfiumWarmUpService.run();
    }

    private static boolean hasInk(BufferedImage image) {
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                if ((image.getRGB(x, y) & 0xFFFFFF) != 0xFFFFFF) {
                    return true;
                }
            }
        }
        return false;
    }
}
