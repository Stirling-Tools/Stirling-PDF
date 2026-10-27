package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.Test;

import stirling.software.common.util.ExceptionUtils.ErrorCode;
import stirling.software.common.util.ExceptionUtils.OutOfMemoryDpiException;

class ImageMemoryLimitTest {

    /** 40000 pt square: 1.6 billion pixels at 72 DPI, over any automatic limit. */
    private static final PDRectangle HUGE_PAGE = new PDRectangle(40_000, 40_000);

    @Test
    void aConfiguredLimitIsTakenInMegapixels() {
        assertThat(ImageMemoryLimit.maxPixels(50, 8L << 30)).isEqualTo(50_000_000L);
    }

    @Test
    void theAutomaticLimitFillsAQuarterOfTheHeapUpToOneGibibyte() {
        assertThat(ImageMemoryLimit.maxPixels(0, 1L << 30)).isEqualTo((1L << 28) / 4);
        assertThat(ImageMemoryLimit.maxPixels(0, 64L << 30)).isEqualTo((1L << 30) / 4);
    }

    @Test
    void aPrintSizePageFits() {
        assertThatCode(
                        () ->
                                ImageMemoryLimit.requirePageFits(
                                        new PDPage(PDRectangle.LETTER), 1, 300 / 72f))
                .doesNotThrowAnyException();
    }

    @Test
    void aPageOverTheLimitIsRefused() {
        assertThatThrownBy(() -> ImageMemoryLimit.requirePageFits(new PDPage(HUGE_PAGE), 3, 1))
                .isInstanceOfSatisfying(
                        OutOfMemoryDpiException.class,
                        e -> {
                            assertThat(e.getErrorCode())
                                    .isEqualTo(ErrorCode.PAGE_IMAGE_TOO_LARGE.getCode());
                            assertThat(e.getMessage()).startsWith("Page 3 at 72 DPI");
                        });
    }

    @Test
    void aCanvasOverTheLimitIsRefused() {
        assertThatThrownBy(() -> ImageMemoryLimit.requireImageFits(40_000, 40_000))
                .isInstanceOfSatisfying(
                        OutOfMemoryDpiException.class,
                        e ->
                                assertThat(e.getErrorCode())
                                        .isEqualTo(ErrorCode.COMBINED_IMAGE_TOO_LARGE.getCode()));
    }

    @Test
    void theRendererRefusesAnOversizedPageBeforeAllocating() throws Exception {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage(PDRectangle.A4));
            document.addPage(new PDPage(HUGE_PAGE));
            LimitedPDFRenderer renderer = new LimitedPDFRenderer(document);

            BufferedImage firstPage = renderer.renderImageWithDPI(0, 72);

            assertThat(firstPage.getWidth()).isEqualTo((int) PDRectangle.A4.getWidth());
            assertThatThrownBy(() -> renderer.renderImageWithDPI(1, 72))
                    .isInstanceOf(OutOfMemoryDpiException.class);
        }
    }
}
