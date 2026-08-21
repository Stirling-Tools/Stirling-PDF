package stirling.software.SPDF.utils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/** Coverage for {@link SvgOverlayUtil}: the real Batik overlay happy path plus isSvgImage edges. */
class SvgOverlayUtilMoreTest {

    private static final String TINY_SVG =
            "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20\" height=\"20\">"
                    + "<rect x=\"2\" y=\"2\" width=\"16\" height=\"16\" fill=\"red\"/></svg>";

    @Nested
    @DisplayName("overlaySvgOnPage")
    class Overlay {

        @Test
        @DisplayName("overlays a valid SVG and leaves the document saveable")
        void overlaysValidSvg() throws Exception {
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.A4);
                doc.addPage(page);

                SvgOverlayUtil.overlaySvgOnPage(
                        doc, page, TINY_SVG.getBytes(StandardCharsets.UTF_8), 50f, 60f);

                ByteArrayOutputStream out = new ByteArrayOutputStream();
                doc.save(out);
                assertThat(out.size()).isPositive();
            }
        }

        @Test
        @DisplayName("invalid SVG bytes raise an IOException")
        void invalidSvgThrows() throws Exception {
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.A4);
                doc.addPage(page);

                assertThatThrownBy(
                                () ->
                                        SvgOverlayUtil.overlaySvgOnPage(
                                                doc,
                                                page,
                                                "not an svg".getBytes(StandardCharsets.UTF_8),
                                                0f,
                                                0f))
                        .isInstanceOf(IOException.class);
            }
        }
    }

    @Nested
    @DisplayName("isSvgImage")
    class IsSvg {

        @Test
        @DisplayName("recognizes a raw <svg> document")
        void recognizesSvgTag() {
            assertThat(SvgOverlayUtil.isSvgImage(TINY_SVG.getBytes(StandardCharsets.UTF_8)))
                    .isTrue();
        }

        @Test
        @DisplayName("recognizes an xml-declared svg document")
        void recognizesXmlSvg() {
            String xml = "<?xml version=\"1.0\"?><svg xmlns=\"x\"></svg>";
            assertThat(SvgOverlayUtil.isSvgImage(xml.getBytes(StandardCharsets.UTF_8))).isTrue();
        }

        @Test
        @DisplayName("rejects null, too-short and non-svg bytes")
        void rejectsNonSvg() {
            assertThat(SvgOverlayUtil.isSvgImage(null)).isFalse();
            assertThat(SvgOverlayUtil.isSvgImage(new byte[] {1, 2})).isFalse();
            assertThat(SvgOverlayUtil.isSvgImage("%PDF-1.7 hello".getBytes(StandardCharsets.UTF_8)))
                    .isFalse();
        }
    }
}
