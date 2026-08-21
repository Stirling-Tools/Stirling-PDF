package stirling.software.SPDF.utils.text;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDSimpleFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.encoding.DictionaryEncoding;
import org.apache.pdfbox.pdmodel.font.encoding.WinAnsiEncoding;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TextEncodingHelperTest {

    // --- isFontSubset ---

    @Test
    void isFontSubset_withNull_returnsFalse() {
        assertFalse(TextEncodingHelper.isFontSubset(null));
    }

    @Test
    void isFontSubset_withSubsetName_returnsTrue() {
        // Subset fonts have format ABCDEF+FontName
        assertTrue(TextEncodingHelper.isFontSubset("ABCDEF+Arial"));
    }

    @Test
    void isFontSubset_withNonSubsetName_returnsFalse() {
        assertFalse(TextEncodingHelper.isFontSubset("Arial"));
    }

    @Test
    void isFontSubset_withLowercasePrefix_returnsFalse() {
        assertFalse(TextEncodingHelper.isFontSubset("abcdef+Arial"));
    }

    @Test
    void isFontSubset_withShortPrefix_returnsFalse() {
        assertFalse(TextEncodingHelper.isFontSubset("ABC+Arial"));
    }

    @Test
    void isFontSubset_withEmptyString_returnsFalse() {
        assertFalse(TextEncodingHelper.isFontSubset(""));
    }

    // --- canEncodeCharacters ---

    @Test
    void canEncodeCharacters_withNullFont_returnsFalse() {
        assertFalse(TextEncodingHelper.canEncodeCharacters(null, "test"));
    }

    @Test
    void canEncodeCharacters_withNullText_returnsFalse() throws IOException {
        PDFont font = mock(PDFont.class);
        assertFalse(TextEncodingHelper.canEncodeCharacters(font, null));
    }

    @Test
    void canEncodeCharacters_withEmptyText_returnsFalse() throws IOException {
        PDFont font = mock(PDFont.class);
        assertFalse(TextEncodingHelper.canEncodeCharacters(font, ""));
    }

    @Test
    void canEncodeCharacters_withSuccessfulEncoding_returnsTrue() throws IOException {
        PDFont font = mock(PDFont.class);
        when(font.encode("Hello")).thenReturn(new byte[] {72, 101, 108, 108, 111});
        when(font.getName()).thenReturn("TestFont");

        assertTrue(TextEncodingHelper.canEncodeCharacters(font, "Hello"));
    }

    @Test
    void canEncodeCharacters_whenEncodingThrowsIOException_returnsFalse() throws IOException {
        PDFont font = mock(PDFont.class);
        when(font.encode("X")).thenThrow(new IOException("encoding error"));
        when(font.getName()).thenReturn("RegularFont");

        assertFalse(TextEncodingHelper.canEncodeCharacters(font, "X"));
    }

    // --- fontSupportsCharacter ---

    @Test
    void fontSupportsCharacter_withNullFont_returnsFalse() {
        assertFalse(TextEncodingHelper.fontSupportsCharacter(null, "A"));
    }

    @Test
    void fontSupportsCharacter_withNullCharacter_returnsFalse() {
        PDFont font = mock(PDFont.class);
        assertFalse(TextEncodingHelper.fontSupportsCharacter(font, null));
    }

    @Test
    void fontSupportsCharacter_withEmptyCharacter_returnsFalse() {
        PDFont font = mock(PDFont.class);
        assertFalse(TextEncodingHelper.fontSupportsCharacter(font, ""));
    }

    @Test
    void fontSupportsCharacter_withSupportedChar_returnsTrue() throws IOException {
        PDFont font = mock(PDFont.class);
        when(font.encode("A")).thenReturn(new byte[] {65});
        when(font.getStringWidth("A")).thenReturn(600f);
        when(font.getName()).thenReturn("TestFont");

        assertTrue(TextEncodingHelper.fontSupportsCharacter(font, "A"));
    }

    @Test
    void fontSupportsCharacter_withZeroWidth_returnsFalse() throws IOException {
        PDFont font = mock(PDFont.class);
        when(font.encode("A")).thenReturn(new byte[] {65});
        when(font.getStringWidth("A")).thenReturn(0f);
        when(font.getName()).thenReturn("TestFont");

        assertFalse(TextEncodingHelper.fontSupportsCharacter(font, "A"));
    }

    @Test
    void fontSupportsCharacter_whenEncodeThrows_returnsFalse() throws IOException {
        PDFont font = mock(PDFont.class);
        when(font.encode("X")).thenThrow(new IOException("fail"));
        when(font.getName()).thenReturn("TestFont");

        assertFalse(TextEncodingHelper.fontSupportsCharacter(font, "X"));
    }

    // --- hasCustomEncoding ---

    @Test
    void hasCustomEncoding_withType0Font_returnsFalse() {
        PDType0Font font = mock(PDType0Font.class);
        when(font.getName()).thenReturn("TestType0");

        assertFalse(TextEncodingHelper.hasCustomEncoding(font));
    }

    @Test
    void hasCustomEncoding_withSimpleFontDictionaryEncoding_returnsTrue() {
        PDSimpleFont font = mock(PDSimpleFont.class);
        DictionaryEncoding encoding = mock(DictionaryEncoding.class);
        when(font.getEncoding()).thenReturn(encoding);
        when(font.getName()).thenReturn("TestFont");

        assertTrue(TextEncodingHelper.hasCustomEncoding(font));
    }

    @Test
    void hasCustomEncoding_withSimpleFontStandardEncoding_returnsFalse() {
        PDSimpleFont font = mock(PDSimpleFont.class);
        when(font.getEncoding()).thenReturn(WinAnsiEncoding.INSTANCE);
        when(font.getName()).thenReturn("TestFont");

        assertFalse(TextEncodingHelper.hasCustomEncoding(font));
    }

    @Test
    void hasCustomEncoding_whenEncodingThrows_returnsTrue() {
        PDSimpleFont font = mock(PDSimpleFont.class);
        when(font.getEncoding()).thenThrow(new RuntimeException("fail"));
        when(font.getName()).thenReturn("TestFont");

        assertTrue(TextEncodingHelper.hasCustomEncoding(font));
    }

    // --- canCalculateBasicWidths ---

    @Test
    void canCalculateBasicWidths_withWorkingFont_returnsTrue() throws IOException {
        PDFont font = mock(PDFont.class);
        when(font.getStringWidth(" ")).thenReturn(250f);
        when(font.getStringWidth("a")).thenReturn(500f);
        when(font.getName()).thenReturn("TestFont");

        assertTrue(TextEncodingHelper.canCalculateBasicWidths(font));
    }

    @Test
    void canCalculateBasicWidths_withZeroSpaceWidth_returnsFalse() throws IOException {
        PDFont font = mock(PDFont.class);
        when(font.getStringWidth(" ")).thenReturn(0f);
        when(font.getName()).thenReturn("TestFont");

        assertFalse(TextEncodingHelper.canCalculateBasicWidths(font));
    }

    @Test
    void canCalculateBasicWidths_whenGetStringWidthThrows_returnsFalse() throws IOException {
        PDFont font = mock(PDFont.class);
        when(font.getStringWidth(anyString())).thenThrow(new IOException("fail"));
        when(font.getName()).thenReturn("TestFont");

        assertFalse(TextEncodingHelper.canCalculateBasicWidths(font));
    }

    // --- isTextSegmentRemovable ---

    @Test
    void isTextSegmentRemovable_withNullFont_returnsFalse() {
        assertFalse(TextEncodingHelper.isTextSegmentRemovable(null, "text"));
    }

    @Test
    void isTextSegmentRemovable_withNullText_returnsFalse() {
        PDFont font = mock(PDFont.class);
        assertFalse(TextEncodingHelper.isTextSegmentRemovable(font, null));
    }

    @Test
    void isTextSegmentRemovable_withEmptyText_returnsFalse() {
        PDFont font = mock(PDFont.class);
        assertFalse(TextEncodingHelper.isTextSegmentRemovable(font, ""));
    }

    // --- isTextFullyRemovable ---

    @Test
    void isTextFullyRemovable_withNullFont_returnsFalse() {
        assertFalse(TextEncodingHelper.isTextFullyRemovable(null, "text"));
    }

    @Test
    void isTextFullyRemovable_withNullText_returnsFalse() {
        PDFont font = mock(PDFont.class);
        assertFalse(TextEncodingHelper.isTextFullyRemovable(font, null));
    }

    @Test
    void isTextFullyRemovable_withEmptyText_returnsFalse() {
        PDFont font = mock(PDFont.class);
        assertFalse(TextEncodingHelper.isTextFullyRemovable(font, ""));
    }
}
