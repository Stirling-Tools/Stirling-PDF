package stirling.software.SPDF.utils.text;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.lang.reflect.Method;

import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDFontDescriptor;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * Gap coverage for TextEncodingHelper - exercises the array-fallback validation path, surrogate
 * handling, simple-character classification and the comprehensive isTextFullyRemovable checks using
 * a mix of real Standard14 fonts and precise mocks.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TextEncodingHelperMoreTest {

    private final PDType1Font helvetica = new PDType1Font(Standard14Fonts.FontName.HELVETICA);

    @Nested
    @DisplayName("canEncodeCharacters - array fallback")
    class CanEncodeArrayFallback {

        @Test
        @DisplayName("real Helvetica encodes Latin text -> true")
        void realFont_latin_true() {
            assertTrue(TextEncodingHelper.canEncodeCharacters(helvetica, "Hello World"));
        }

        @Test
        @DisplayName("empty full encoding but per-char success -> array fallback allows")
        void emptyFullEncoding_arrayFallbackAllows() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("SubFont");
            when(font.encode("AB")).thenReturn(new byte[0]);
            when(font.encode("A")).thenReturn(new byte[] {65});
            when(font.encode("B")).thenReturn(new byte[] {66});
            when(font.getStringWidth("A")).thenReturn(500f);
            when(font.getStringWidth("B")).thenReturn(500f);

            assertTrue(TextEncodingHelper.canEncodeCharacters(font, "AB"));
        }

        @Test
        @DisplayName("below 95% success rate -> array fallback rejects")
        void lowSuccessRate_rejects() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("SubFont");
            when(font.encode("AB")).thenReturn(new byte[0]);
            when(font.encode("A")).thenReturn(new byte[] {65});
            when(font.getStringWidth("A")).thenReturn(500f);
            // "B" fails encoding -> 1/2 = 50% < 95%
            when(font.encode("B")).thenThrow(new IOException("no B"));

            assertFalse(TextEncodingHelper.canEncodeCharacters(font, "AB"));
        }

        @Test
        @DisplayName("negative per-char width is not counted as success")
        void negativeWidth_notCounted() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("SubFont");
            // full-string encode empty -> array fallback; per-char encodes ok but widths negative
            when(font.encode("AB")).thenReturn(new byte[0]);
            when(font.encode("A")).thenReturn(new byte[] {65});
            when(font.encode("B")).thenReturn(new byte[] {66});
            when(font.getStringWidth("A")).thenReturn(-1f);
            when(font.getStringWidth("B")).thenReturn(-2f);

            assertFalse(TextEncodingHelper.canEncodeCharacters(font, "AB"));
        }

        @Test
        @DisplayName("exception on full encode + subset name -> array fallback used")
        void exceptionWithSubsetName_arrayFallback() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("ABCDEF+Subset");
            when(font.encode("X")).thenThrow(new IOException("boom"));
            // array fallback re-invokes encode per-char; still throws -> 0% -> reject
            assertFalse(TextEncodingHelper.canEncodeCharacters(font, "X"));
        }

        @Test
        @DisplayName("exception on full encode, non-subset no-custom -> false without fallback")
        void exceptionNonSubset_false() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("PlainFont");
            when(font.encode("X")).thenThrow(new IllegalArgumentException("bad"));
            assertFalse(TextEncodingHelper.canEncodeCharacters(font, "X"));
        }

        @Test
        @DisplayName("surrogate pair code point is iterated as a single unit in fallback")
        void surrogatePair_iteratedOnce() throws IOException {
            String emoji = "😀"; // U+1F600 (surrogate pair)
            String text = emoji + "A";
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("EmojiSub");
            // full-string encode fails -> array fallback iterates code points
            when(font.encode(text)).thenReturn(new byte[0]);
            when(font.encode(emoji)).thenReturn(new byte[] {1, 2});
            when(font.encode("A")).thenReturn(new byte[] {65});
            when(font.getStringWidth(emoji)).thenReturn(700f);
            when(font.getStringWidth("A")).thenReturn(500f);

            assertTrue(TextEncodingHelper.canEncodeCharacters(font, text));
        }
    }

    @Nested
    @DisplayName("isTextSegmentRemovable")
    class TextSegmentRemovable {

        @Test
        @DisplayName("simple char on real font -> removable")
        void simpleChar_realFont_true() {
            assertTrue(TextEncodingHelper.isTextSegmentRemovable(helvetica, "A"));
        }

        @Test
        @DisplayName("simple char where encode throws -> not removable")
        void simpleChar_encodeThrows_false() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("F");
            when(font.encode("A")).thenThrow(new IOException("fail"));
            assertFalse(TextEncodingHelper.isTextSegmentRemovable(font, "A"));
        }

        @Test
        @DisplayName("complex text delegates to full removable check (real font)")
        void complexText_delegates() {
            // Contains a non-simple char (emoji) -> goes through isTextFullyRemovable
            assertFalse(TextEncodingHelper.isTextSegmentRemovable(helvetica, "Hi 😀 there"));
        }

        @Test
        @DisplayName("long simple-looking string over 20 chars routes to full check")
        void longText_routesToFull() {
            String longText = "abcdefghijklmnopqrstuvwxyz"; // 26 chars > 20
            // Helvetica can encode all of these so the full path returns true
            assertTrue(TextEncodingHelper.isTextSegmentRemovable(helvetica, longText));
        }
    }

    @Nested
    @DisplayName("isTextFullyRemovable")
    class TextFullyRemovable {

        @Test
        @DisplayName("real font, encodable text -> fully removable")
        void realFont_true() {
            assertTrue(TextEncodingHelper.isTextFullyRemovable(helvetica, "Sample text"));
        }

        @Test
        @DisplayName("negative width rejects removal")
        void negativeWidth_false() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("F");
            when(font.encode("ab")).thenReturn(new byte[] {1, 2});
            when(font.getStringWidth("ab")).thenReturn(-5f);

            assertFalse(TextEncodingHelper.isTextFullyRemovable(font, "ab"));
        }

        @Test
        @DisplayName("missing font descriptor rejects removal")
        void nullDescriptor_false() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("F");
            when(font.encode("ab")).thenReturn(new byte[] {1, 2});
            when(font.getStringWidth("ab")).thenReturn(100f);
            when(font.getFontDescriptor()).thenReturn(null);

            assertFalse(TextEncodingHelper.isTextFullyRemovable(font, "ab"));
        }

        @Test
        @DisplayName("font bounding box throwing rejects removal")
        void bboxThrows_false() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("F");
            when(font.encode("ab")).thenReturn(new byte[] {1, 2});
            when(font.getStringWidth("ab")).thenReturn(100f);
            PDFontDescriptor descriptor = mock(PDFontDescriptor.class);
            when(descriptor.getFontBoundingBox())
                    .thenThrow(new IllegalArgumentException("no bbox"));
            when(font.getFontDescriptor()).thenReturn(descriptor);

            assertFalse(TextEncodingHelper.isTextFullyRemovable(font, "ab"));
        }

        @Test
        @DisplayName("IOException during width calc rejects removal")
        void widthIOException_false() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("F");
            when(font.encode("ab")).thenReturn(new byte[] {1, 2});
            when(font.getStringWidth("ab")).thenThrow(new IOException("io"));

            assertFalse(TextEncodingHelper.isTextFullyRemovable(font, "ab"));
        }
    }

    @Nested
    @DisplayName("hasCustomEncoding extra branches")
    class HasCustomEncoding {

        @Test
        @DisplayName("real Type1 standard-encoded font -> not custom")
        void realType1_notCustom() {
            assertFalse(TextEncodingHelper.hasCustomEncoding(helvetica));
        }

        @Test
        @DisplayName("non-simple non-Type0 font assumes standard encoding -> false")
        void type3Font_assumesStandard() {
            PDType3Font font = mock(PDType3Font.class);
            when(font.getName()).thenReturn("T3");
            assertFalse(TextEncodingHelper.hasCustomEncoding(font));
        }

        @Test
        @DisplayName("simple font with null encoding -> not custom")
        void simpleFontNullEncoding_false() {
            org.apache.pdfbox.pdmodel.font.PDSimpleFont font =
                    mock(org.apache.pdfbox.pdmodel.font.PDSimpleFont.class);
            when(font.getEncoding()).thenReturn(null);
            when(font.getName()).thenReturn("S");
            assertFalse(TextEncodingHelper.hasCustomEncoding(font));
        }
    }

    @Nested
    @DisplayName("canCalculateBasicWidths extra branches")
    class CanCalculateBasicWidths {

        @Test
        @DisplayName("real font calculates widths -> true")
        void realFont_true() {
            assertTrue(TextEncodingHelper.canCalculateBasicWidths(helvetica));
        }

        @Test
        @DisplayName("space ok but all test chars throw -> false")
        void testCharsThrow_false() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getStringWidth(" ")).thenReturn(250f);
            when(font.getStringWidth("a")).thenThrow(new IOException("x"));
            when(font.getStringWidth("A")).thenThrow(new IOException("x"));
            when(font.getStringWidth("0")).thenThrow(new IOException("x"));
            when(font.getStringWidth(".")).thenThrow(new IOException("x"));
            when(font.getStringWidth("e")).thenThrow(new IOException("x"));
            when(font.getStringWidth("!")).thenThrow(new IOException("x"));

            assertFalse(TextEncodingHelper.canCalculateBasicWidths(font));
        }

        @Test
        @DisplayName("space ok but test chars return zero width -> false")
        void testCharsZero_false() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getStringWidth(anyString())).thenReturn(0f);
            when(font.getStringWidth(" ")).thenReturn(250f);

            assertFalse(TextEncodingHelper.canCalculateBasicWidths(font));
        }
    }

    @Nested
    @DisplayName("isSimpleCharacter via reflection")
    class IsSimpleCharacter {

        private boolean isSimple(String text) throws Exception {
            Method m =
                    TextEncodingHelper.class.getDeclaredMethod("isSimpleCharacter", String.class);
            m.setAccessible(true);
            return (boolean) m.invoke(null, text);
        }

        @Test
        @DisplayName("letters digits whitespace and common punctuation are simple")
        void simpleCases() throws Exception {
            assertTrue(isSimple("abc 123"));
            assertTrue(isSimple("Hello, world!"));
            // underscore is NOT in the allow-list, but hyphen is
            assertTrue(isSimple("a-b.c"));
        }

        @Test
        @DisplayName("underscore is not an allowed simple punctuation")
        void underscore_false() throws Exception {
            assertFalse(isSimple("a_b"));
        }

        @Test
        @DisplayName("over 20 chars is not simple")
        void tooLong_false() throws Exception {
            assertFalse(isSimple("aaaaaaaaaaaaaaaaaaaaaaa")); // 23 chars
        }

        @Test
        @DisplayName("non-letter non-ASCII symbol is not simple")
        void nonAscii_false() throws Exception {
            // euro sign is not a letter/digit and not in the ASCII punctuation allow-list
            assertFalse(isSimple("a€b"));
        }

        @Test
        @DisplayName("null and empty are not simple")
        void nullEmpty_false() throws Exception {
            assertFalse(isSimple(null));
            assertFalse(isSimple(""));
        }
    }
}
