package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;

import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link PdfJsonConversionService#parseToUnicodeCodepoint(String)}.
 *
 * <p>The function exists because PDF ToUnicode CMap entries can encode supplementary-plane
 * codepoints (above U+FFFF) as UTF-16 surrogate pairs, e.g. {@code <D837DF0E>} for U+1F40E. The
 * naive implementation that called {@link Integer#parseInt(String, int)} on the whole hex string
 * threw {@link NumberFormatException} for any 8-char value because they overflow {@code int}. That
 * triggered a fallback that left fonts with no proper CID mapping and made downstream JSON&rarr;PDF
 * rebuilds slow/hung when rendering text with those fonts.
 */
class PdfJsonConversionServiceUnicodeParsingTest {

    @Test
    void parsesSingleBmpCodeUnit() {
        // Latin capital A.
        assertEquals(0x41, PdfJsonConversionService.parseToUnicodeCodepoint("0041"));
    }

    @Test
    void parsesShortBmpHexValue() {
        // Some ToUnicode entries omit leading zeros for low codepoints.
        assertEquals(0x41, PdfJsonConversionService.parseToUnicodeCodepoint("41"));
    }

    @Test
    void parsesSupplementaryCodepointFromSurrogatePair() {
        // U+1F40E HORSE encoded as UTF-16 surrogate pair D83D DC0E. The bug we are fixing was
        // that Integer.parseInt("D83DDC0E", 16) overflows because D83DDC0E > Integer.MAX_VALUE.
        assertEquals(0x1F40E, PdfJsonConversionService.parseToUnicodeCodepoint("D83DDC0E"));
    }

    @Test
    void parsesSurrogatePairFromUserReportedHang() {
        // The exact hex value from the user's hang reproducer log:
        // "Failed to build Unicode mapping for font NotoSans-Regular: For input string:
        //  \"D837DF0E\" under radix 16"
        // D837 DF0E decodes to U+1DF0E (CJK supplementary). Important assertion: it returns a
        // valid codepoint instead of overflowing Integer.parseInt and throwing.
        int expected = new String(new char[] {(char) 0xD837, (char) 0xDF0E}).codePointAt(0);
        assertEquals(0x1DF0E, expected); // sanity check on the test setup itself
        assertEquals(expected, PdfJsonConversionService.parseToUnicodeCodepoint("D837DF0E"));
    }

    @Test
    void parsesLigatureDecompositionAsFirstCodepoint() {
        // A ToUnicode entry can map one charCode to multiple Unicode chars (a ligature). PDF
        // spec allows e.g. <0041 0042> for "AB". Our best-effort behavior is to return the
        // first codepoint so the mapping is at least roughly meaningful for search/copy.
        assertEquals(0x41, PdfJsonConversionService.parseToUnicodeCodepoint("00410042"));
    }

    @Test
    void rejectsEmptyHex() {
        assertThrows(
                NumberFormatException.class,
                () -> PdfJsonConversionService.parseToUnicodeCodepoint(""));
    }

    @Test
    void rejectsNullHex() {
        assertThrows(
                NumberFormatException.class,
                () -> PdfJsonConversionService.parseToUnicodeCodepoint(null));
    }

    @Test
    void rejectsOddByteCountAboveBmp() {
        // 6 hex chars is 3 bytes — not a valid UTF-16BE sequence.
        assertThrows(
                NumberFormatException.class,
                () -> PdfJsonConversionService.parseToUnicodeCodepoint("D83DDC"));
    }

    @Test
    void countCodesProtectedTerminatesWhenReaderMakesNoProgress() {
        // Reproduces the user's hang: PDFBox's CMap.readCode can return a successful code (0)
        // from a stream where no bytes were consumed (corrupt codespace matching 0x00 bytes from
        // the buffer's uninitialized region after EOF). Without the no-progress guard, the
        // counting loop in countGlyphs ran forever.
        ByteArrayInputStream stream = new ByteArrayInputStream(new byte[] {1, 2, 3, 4});
        PdfJsonConversionService.CodeReader reader = in -> 0; // never reads, always "succeeds"

        int count =
                assertTimeoutPreemptively(
                        Duration.ofSeconds(2),
                        () -> PdfJsonConversionService.countCodesProtected(stream, reader));

        // First iteration sees no progress and breaks immediately.
        assertEquals(0, count);
    }

    @Test
    void countCodesProtectedTerminatesOnEmptyStream() {
        ByteArrayInputStream stream = new ByteArrayInputStream(new byte[0]);
        PdfJsonConversionService.CodeReader reader =
                in -> {
                    throw new AssertionError("reader must not be called when stream is empty");
                };

        int count =
                assertTimeoutPreemptively(
                        Duration.ofSeconds(2),
                        () -> PdfJsonConversionService.countCodesProtected(stream, reader));

        assertEquals(0, count);
    }

    @Test
    void countCodesProtectedHonorsExplicitMinusOneReturn() throws IOException {
        ByteArrayInputStream stream = new ByteArrayInputStream(new byte[] {1, 2, 3});
        PdfJsonConversionService.CodeReader reader =
                in -> {
                    int b = in.read();
                    return b == -1 ? -1 : b;
                };

        int count = PdfJsonConversionService.countCodesProtected(stream, reader);

        assertEquals(3, count);
    }

    @Test
    void countCodesProtectedTerminatesIfReaderReadsThenStops() throws IOException {
        // A reader that consumes one byte then hits a corrupt-CMap pattern returning 0 without
        // consuming further must still terminate after counting the consumed bytes.
        ByteArrayInputStream stream = new ByteArrayInputStream(new byte[] {1, 2, 3, 4});
        PdfJsonConversionService.CodeReader reader =
                new PdfJsonConversionService.CodeReader() {
                    boolean firstCall = true;

                    @Override
                    public int readCode(InputStream in) throws IOException {
                        if (firstCall) {
                            firstCall = false;
                            return in.read();
                        }
                        return 0; // simulates corrupt CMap thereafter
                    }
                };

        int count =
                assertTimeoutPreemptively(
                        Duration.ofSeconds(2),
                        () -> PdfJsonConversionService.countCodesProtected(stream, reader));

        assertEquals(1, count);
    }
}
