package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.*;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.List;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.junit.jupiter.api.Test;

class SvgToPdfTest {

    private static final String SIMPLE_SVG =
            "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\">"
                    + "<rect width=\"100\" height=\"100\" fill=\"red\"/>"
                    + "</svg>";

    private static final String SIMPLE_SVG_2 =
            "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"150\">"
                    + "<circle cx=\"100\" cy=\"75\" r=\"50\" fill=\"blue\"/>"
                    + "</svg>";

    @Test
    void convert_withValidSvg_returnsPdfBytes() throws IOException {
        byte[] svgBytes = SIMPLE_SVG.getBytes(StandardCharsets.UTF_8);
        byte[] result = SvgToPdf.convert(svgBytes);

        assertNotNull(result);
        assertTrue(result.length > 0);
        // PDF files start with %PDF
        String header =
                new String(result, 0, Math.min(5, result.length), StandardCharsets.US_ASCII);
        assertTrue(header.startsWith("%PDF"), "Output should be a valid PDF");
    }

    @Test
    void convert_withNullInput_throwsIOException() {
        IOException ex = assertThrows(IOException.class, () -> SvgToPdf.convert(null));
        assertTrue(ex.getMessage().contains("empty or null"));
    }

    @Test
    void convert_withEmptyInput_throwsIOException() {
        IOException ex = assertThrows(IOException.class, () -> SvgToPdf.convert(new byte[0]));
        assertTrue(ex.getMessage().contains("empty or null"));
    }

    @Test
    void convert_withInvalidSvg_throwsIOException() {
        byte[] invalidSvg = "not an svg at all".getBytes(StandardCharsets.UTF_8);
        assertThrows(IOException.class, () -> SvgToPdf.convert(invalidSvg));
    }

    @Test
    void convert_withMalformedXml_throwsIOException() {
        byte[] malformed = "<svg><unclosed".getBytes(StandardCharsets.UTF_8);
        assertThrows(IOException.class, () -> SvgToPdf.convert(malformed));
    }

    @Test
    void combineIntoPdf_withNullList_throwsIOException() {
        IOException ex = assertThrows(IOException.class, () -> SvgToPdf.combineIntoPdf(null));
        assertTrue(ex.getMessage().contains("empty or null"));
    }

    @Test
    void combineIntoPdf_withEmptyList_throwsIOException() {
        IOException ex =
                assertThrows(
                        IOException.class, () -> SvgToPdf.combineIntoPdf(Collections.emptyList()));
        assertTrue(ex.getMessage().contains("empty or null"));
    }

    @Test
    void combineIntoPdf_withSingleSvg_returnsPdf() throws IOException {
        List<byte[]> svgs = List.of(SIMPLE_SVG.getBytes(StandardCharsets.UTF_8));
        byte[] result = SvgToPdf.combineIntoPdf(svgs);

        assertNotNull(result);
        assertTrue(result.length > 0);
        String header =
                new String(result, 0, Math.min(5, result.length), StandardCharsets.US_ASCII);
        assertTrue(header.startsWith("%PDF"));
    }

    @Test
    void combineIntoPdf_withMultipleSvgs_returnsPdf() throws IOException {
        List<byte[]> svgs =
                List.of(
                        SIMPLE_SVG.getBytes(StandardCharsets.UTF_8),
                        SIMPLE_SVG_2.getBytes(StandardCharsets.UTF_8));
        byte[] result = SvgToPdf.combineIntoPdf(svgs);

        assertNotNull(result);
        assertTrue(result.length > 0);
    }

    @Test
    void combineIntoPdf_skipsNullEntries() throws IOException {
        List<byte[]> svgs =
                Arrays.asList(
                        SIMPLE_SVG.getBytes(StandardCharsets.UTF_8),
                        null,
                        SIMPLE_SVG_2.getBytes(StandardCharsets.UTF_8));
        byte[] result = SvgToPdf.combineIntoPdf(svgs);

        assertNotNull(result);
        assertTrue(result.length > 0);
    }

    @Test
    void combineIntoPdf_skipsEmptyEntries() throws IOException {
        List<byte[]> svgs = Arrays.asList(SIMPLE_SVG.getBytes(StandardCharsets.UTF_8), new byte[0]);
        byte[] result = SvgToPdf.combineIntoPdf(svgs);

        assertNotNull(result);
        assertTrue(result.length > 0);
    }

    @Test
    void combineIntoPdf_allNullEntries_throwsIOException() {
        List<byte[]> svgs = Arrays.asList(null, null, new byte[0]);
        assertThrows(IOException.class, () -> SvgToPdf.combineIntoPdf(svgs));
    }

    @Test
    void convert_doesNotEmbedExternalFileResource() throws Exception {
        Path external = Files.createTempFile("svg-external", ".png");
        BufferedImage red = new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = red.createGraphics();
        g.setColor(Color.RED);
        g.fillRect(0, 0, 100, 100);
        g.dispose();
        ImageIO.write(red, "png", external.toFile());

        try {
            String svg =
                    "<svg xmlns=\"http://www.w3.org/2000/svg\" "
                            + "xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"100\" height=\"100\">"
                            + "<image x=\"0\" y=\"0\" width=\"100\" height=\"100\" xlink:href=\""
                            + external.toUri()
                            + "\"/></svg>";

            byte[] pdf;
            try {
                pdf = SvgToPdf.convert(svg.getBytes(StandardCharsets.UTF_8));
            } catch (IOException blocked) {
                return;
            }

            try (PDDocument doc = Loader.loadPDF(pdf)) {
                BufferedImage page = new PDFRenderer(doc).renderImageWithDPI(0, 72);
                int rgb = page.getRGB(page.getWidth() / 2, page.getHeight() / 2);
                int r = (rgb >> 16) & 0xff;
                int gg = (rgb >> 8) & 0xff;
                int b = rgb & 0xff;
                assertFalse(
                        r > 200 && gg < 60 && b < 60,
                        "External file image must not be rendered into the PDF");
            }
        } finally {
            Files.deleteIfExists(external);
        }
    }

    // A self-contained SVG whose only content is an inline base64 data: image (a solid-red vector
    // SVG). Vector data: images decode via batik-bridge without batik-codec, so this exercises the
    // data: security allowance independent of raster codecs.
    private static String svgWithInlineRedImage() {
        String innerSvg =
                "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\">"
                        + "<rect width=\"100\" height=\"100\" fill=\"red\"/></svg>";
        String dataUri =
                "data:image/svg+xml;base64,"
                        + Base64.getEncoder()
                                .encodeToString(innerSvg.getBytes(StandardCharsets.UTF_8));
        return "<svg xmlns=\"http://www.w3.org/2000/svg\" "
                + "xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"100\" height=\"100\">"
                + "<image x=\"0\" y=\"0\" width=\"100\" height=\"100\" xlink:href=\""
                + dataUri
                + "\"/></svg>";
    }

    @Test
    void convert_rendersInlineDataUriImage() throws IOException {
        byte[] pdf = SvgToPdf.convert(svgWithInlineRedImage().getBytes(StandardCharsets.UTF_8));
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            BufferedImage page = new PDFRenderer(doc).renderImageWithDPI(0, 72);
            int rgb = page.getRGB(page.getWidth() / 2, page.getHeight() / 2);
            int r = (rgb >> 16) & 0xff;
            int gg = (rgb >> 8) & 0xff;
            int b = rgb & 0xff;
            assertTrue(
                    r > 200 && gg < 60 && b < 60,
                    "Inline data: image must be rendered into the PDF (center rgb="
                            + Integer.toHexString(rgb)
                            + ")");
        }
    }

    @Test
    void combineIntoPdf_keepsPageWithInlineDataUriImage() throws IOException {
        List<byte[]> svgs =
                List.of(
                        SIMPLE_SVG.getBytes(StandardCharsets.UTF_8),
                        svgWithInlineRedImage().getBytes(StandardCharsets.UTF_8));
        byte[] pdf = SvgToPdf.combineIntoPdf(svgs);
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            assertEquals(2, doc.getNumberOfPages(), "inline data: image page must not be dropped");
        }
    }
}
