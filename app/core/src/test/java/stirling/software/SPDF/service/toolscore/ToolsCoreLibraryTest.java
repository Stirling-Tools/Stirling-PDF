package stirling.software.SPDF.service.toolscore;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.model.PageSize;
import stirling.software.jpdfium.model.RenderResult;
import stirling.software.jpdfium.panama.NativeLoader;

/** Runs the real native library, so only where the build bundled it (cargo was available). */
@EnabledIf("libraryBundled")
class ToolsCoreLibraryTest {

    private static final ColorAdjustments NEUTRAL =
            new ColorAdjustments(100, 100, 100, 100, 100, 100);

    static boolean libraryBundled() {
        String resource =
                "tools-core/natives/"
                        + NativeLoader.detectPlatform()
                        + "/"
                        + System.mapLibraryName("stirling_tools");
        return ToolsCoreLibraryTest.class.getClassLoader().getResource(resource) != null;
    }

    private final ToolsCoreLibrary library = new ToolsCoreLibrary();

    @Test
    void keepsEveryPageAndItsSize() throws IOException {
        byte[] adjusted =
                library.adjustColors(pdf(PDRectangle.LETTER, landscape(PDRectangle.A4)), NEUTRAL);

        try (PdfDocument result = PdfDocument.open(adjusted)) {
            assertThat(result.pageCount()).isEqualTo(2);
            assertSize(result, 0, PDRectangle.LETTER);
            assertSize(result, 1, landscape(PDRectangle.A4));
        }
    }

    @Test
    void neutralAdjustmentsKeepTheWhiteBackground() throws IOException {
        byte[] adjusted = library.adjustColors(pdf(PDRectangle.LETTER), NEUTRAL);

        assertThat(cornerPixel(adjusted)).containsExactly(255, 255, 255);
    }

    @Test
    void zeroBrightnessBlackensThePage() throws IOException {
        ColorAdjustments dark = new ColorAdjustments(100, 0, 100, 100, 100, 100);

        byte[] adjusted = library.adjustColors(pdf(PDRectangle.LETTER), dark);

        assertThat(cornerPixel(adjusted)).containsExactly(0, 0, 0);
    }

    private static void assertSize(PdfDocument document, int index, PDRectangle expected) {
        try (PdfPage page = document.page(index)) {
            PageSize size = page.size();
            assertThat(size.width()).isCloseTo(expected.getWidth(), within(0.01f));
            assertThat(size.height()).isCloseTo(expected.getHeight(), within(0.01f));
        }
    }

    private static int[] cornerPixel(byte[] pdf) {
        try (PdfDocument document = PdfDocument.open(pdf);
                PdfPage page = document.page(0)) {
            RenderResult render = page.renderAt(36);
            byte[] rgba = render.rgba();
            return new int[] {rgba[0] & 0xFF, rgba[1] & 0xFF, rgba[2] & 0xFF};
        }
    }

    private static PDRectangle landscape(PDRectangle portrait) {
        return new PDRectangle(portrait.getHeight(), portrait.getWidth());
    }

    private static byte[] pdf(PDRectangle... pageSizes) throws IOException {
        try (PDDocument document = new PDDocument()) {
            for (PDRectangle size : pageSizes) {
                PDPage page = new PDPage(size);
                document.addPage(page);
                try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                    content.beginText();
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 24);
                    content.newLineAtOffset(72, size.getHeight() / 2);
                    content.showText("Adjust colours");
                    content.endText();
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }
}
