package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;

import javax.imageio.ImageIO;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
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
        assertThatThrownBy(() -> ImageMemoryLimit.requireCombinedImageFits(40_000, 40_000))
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

    @Test
    void anEmbeddedImageIsSizedFromItsDictionaryWithoutDecoding() throws IOException {
        try (PDDocument document = new PDDocument()) {
            assertThat(ImageMemoryLimit.embeddedImageFits(declaredImage(document, 100, 100)))
                    .isTrue();
            PDImageXObject bomb = declaredImage(document, 40_000, 40_000);

            assertThat(ImageMemoryLimit.embeddedImageFits(bomb)).isFalse();
            assertThatThrownBy(() -> ImageMemoryLimit.requireEmbeddedImageFits(bomb))
                    .isInstanceOfSatisfying(
                            OutOfMemoryDpiException.class,
                            e ->
                                    assertThat(e.getErrorCode())
                                            .isEqualTo(
                                                    ErrorCode.EMBEDDED_IMAGE_TOO_LARGE.getCode()));
        }
    }

    @Test
    void aSoftMaskLargerThanItsImageCounts() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDImageXObject image = declaredImage(document, 100, 100);
            image.getCOSObject()
                    .setItem(COSName.SMASK, declaredImage(document, 40_000, 40_000).getCOSObject());

            assertThat(ImageMemoryLimit.embeddedImageFits(image)).isFalse();
        }
    }

    @Test
    void aJpegIsSizedFromItsOwnHeaderWhateverTheDictionaryDeclares() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDImageXObject image = declaredImage(document, 8, 8);
            COSStream stream = image.getCOSObject();
            try (OutputStream out = stream.createRawOutputStream()) {
                out.write(jpegClaiming(60_000, 60_000));
            }
            stream.setItem(COSName.FILTER, COSName.DCT_DECODE);

            assertThat(ImageMemoryLimit.embeddedImageFits(image)).isFalse();
        }
    }

    private static PDImageXObject declaredImage(PDDocument document, int width, int height)
            throws IOException {
        COSStream stream = document.getDocument().createCOSStream();
        stream.setItem(COSName.SUBTYPE, COSName.IMAGE);
        stream.setInt(COSName.WIDTH, width);
        stream.setInt(COSName.HEIGHT, height);
        stream.setInt(COSName.BITS_PER_COMPONENT, 8);
        stream.setItem(COSName.COLORSPACE, COSName.DEVICERGB);
        return new PDImageXObject(new PDStream(stream), null);
    }

    /** An 8x8 JPEG whose SOF0 header is rewritten to claim another size. */
    private static byte[] jpegClaiming(int width, int height) throws IOException {
        ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB), "jpeg", encoded);
        byte[] jpeg = encoded.toByteArray();
        for (int i = 2; i + 8 < jpeg.length; i++) {
            if ((jpeg[i] & 0xFF) == 0xFF && (jpeg[i + 1] & 0xFF) == 0xC0) {
                jpeg[i + 5] = (byte) (height >> 8);
                jpeg[i + 6] = (byte) height;
                jpeg[i + 7] = (byte) (width >> 8);
                jpeg[i + 8] = (byte) width;
                return jpeg;
            }
        }
        throw new IllegalStateException("no SOF0 marker");
    }
}
