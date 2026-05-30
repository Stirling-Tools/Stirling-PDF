package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

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
}
