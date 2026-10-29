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

    @Test
    void anImageDeclaringMoreThanTheLimitIsRejected() throws IOException {
        try (PDDocument document = Loader.loadPDF(pdfWithImage(46000, 46000))) {
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
