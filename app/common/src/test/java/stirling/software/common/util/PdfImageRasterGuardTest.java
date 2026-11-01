package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;

class PdfImageRasterGuardTest {

    private static byte[] pdfWithImage(int width, int height) throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            COSStream image = document.getDocument().createCOSStream();
            image.setItem(COSName.TYPE, COSName.XOBJECT);
            image.setItem(COSName.SUBTYPE, COSName.IMAGE);
            image.setInt(COSName.WIDTH, width);
            image.setInt(COSName.HEIGHT, height);
            image.setInt(COSName.BITS_PER_COMPONENT, 8);
            image.setItem(COSName.COLORSPACE, COSName.DEVICEGRAY);
            // Reference it from the page so it is written as an indirect object.
            page.getCOSObject().setItem(COSName.getPDFName("GuardImage"), image);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    private static byte[] pdfWithMaskedImage(int w, int h, int mw, int mh) throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            COSStream mask = document.getDocument().createCOSStream();
            mask.setItem(COSName.SUBTYPE, COSName.IMAGE);
            mask.setInt(COSName.WIDTH, mw);
            mask.setInt(COSName.HEIGHT, mh);
            mask.setInt(COSName.BITS_PER_COMPONENT, 8);
            mask.setItem(COSName.COLORSPACE, COSName.DEVICEGRAY);
            COSStream image = document.getDocument().createCOSStream();
            image.setItem(COSName.TYPE, COSName.XOBJECT);
            image.setItem(COSName.SUBTYPE, COSName.IMAGE);
            image.setInt(COSName.WIDTH, w);
            image.setInt(COSName.HEIGHT, h);
            image.setInt(COSName.BITS_PER_COMPONENT, 8);
            image.setItem(COSName.COLORSPACE, COSName.DEVICEGRAY);
            image.setItem(COSName.SMASK, mask);
            page.getCOSObject().setItem(COSName.getPDFName("GuardImage"), image);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    @Test
    void anImageDeclaringMoreThanTheLimitIsRejected() throws IOException {
        try (PDDocument document = Loader.loadPDF(pdfWithImage(46000, 46000))) {
            assertThatThrownBy(() -> PdfImageRasterGuard.validate(document))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void theCombinedImageAndMaskRasterIsRejected() throws IOException {
        // Each alone is within the limit (15000 px), but they scale to a 15000x15000 raster.
        try (PDDocument document = Loader.loadPDF(pdfWithMaskedImage(15000, 1, 1, 15000))) {
            assertThatThrownBy(() -> PdfImageRasterGuard.validate(document))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void anImageWithinTheLimitPasses() throws IOException {
        try (PDDocument document = Loader.loadPDF(pdfWithImage(10, 10))) {
            assertThatCode(() -> PdfImageRasterGuard.validate(document)).doesNotThrowAnyException();
        }
    }

    @Test
    void theLimitIsOneHundredMillionPixels() {
        assertThat(PdfImageRasterGuard.MAX_IMAGE_PIXELS).isEqualTo(100_000_000L);
    }
}
