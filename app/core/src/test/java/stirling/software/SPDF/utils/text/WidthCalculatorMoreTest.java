package stirling.software.SPDF.utils.text;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDFontDescriptor;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * Extra coverage for {@link WidthCalculator} focusing on the character-iteration fallback, the
 * bounding-box and average-width fallbacks, and the reliability checks against real Standard-14
 * fonts.
 */
@DisplayName("WidthCalculator (more) Tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WidthCalculatorMoreTest {

    @Nested
    @DisplayName("Real Standard-14 font behaviour")
    class RealFontTests {

        @Test
        @DisplayName("Computes a positive scaled width for an encodable string")
        void positiveWidthForEncodableString() {
            PDFont helvetica = new PDType1Font(Standard14Fonts.FontName.HELVETICA);

            float width = WidthCalculator.calculateAccurateWidth(helvetica, "Hello", 12f);

            assertThat(width).isGreaterThan(0f);
        }

        @Test
        @DisplayName("Width scales linearly with font size")
        void widthScalesWithFontSize() {
            PDFont helvetica = new PDType1Font(Standard14Fonts.FontName.HELVETICA);

            float at12 = WidthCalculator.calculateAccurateWidth(helvetica, "Width", 12f);
            float at24 = WidthCalculator.calculateAccurateWidth(helvetica, "Width", 24f);

            assertThat(at24).isCloseTo(at12 * 2f, within(0.5f));
        }

        @Test
        @DisplayName("Standard-14 Helvetica is reported as reliable")
        void standard14FontIsReliable() {
            PDFont helvetica = new PDType1Font(Standard14Fonts.FontName.HELVETICA);

            assertThat(WidthCalculator.isWidthCalculationReliable(helvetica)).isTrue();
        }
    }

    @Nested
    @DisplayName("Character-iteration fallback")
    class CharacterIterationTests {

        @Test
        @DisplayName("Uses per-glyph widths when getStringWidth throws but chars encode")
        void perGlyphWhenStringWidthThrows() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("IterFont");
            // canEncodeCharacters succeeds for the whole string.
            when(font.encode(anyString())).thenReturn(new byte[] {65});
            // Direct width path fails, forcing character iteration.
            when(font.getStringWidth(anyString())).thenThrow(new IOException("no string width"));
            // Each glyph reports a positive width.
            when(font.getWidth(anyInt())).thenReturn(600f);

            float width = WidthCalculator.calculateAccurateWidth(font, "AB", 10f);

            // 600/1000 * 10 = 6 per char, two chars -> 12.
            assertThat(width).isCloseTo(12f, within(0.01f));
        }

        @Test
        @DisplayName("Falls back to width-from-font when glyph width is zero")
        void widthFromFontWhenGlyphWidthZero() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("ZeroGlyphFont");
            when(font.encode(anyString())).thenReturn(new byte[] {65});
            when(font.getStringWidth(anyString())).thenThrow(new IOException("no string width"));
            when(font.getWidth(anyInt())).thenReturn(0f);
            when(font.getWidthFromFont(anyInt())).thenReturn(500f);

            float width = WidthCalculator.calculateAccurateWidth(font, "A", 10f);

            // 500/1000 * 10 = 5.
            assertThat(width).isCloseTo(5f, within(0.01f));
        }

        @Test
        @DisplayName("Falls back to average width when both glyph lookups fail")
        void averageWidthWhenGlyphLookupsFail() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("AvgFont");
            when(font.encode(anyString())).thenReturn(new byte[] {65});
            when(font.getStringWidth(anyString())).thenThrow(new IOException("no string width"));
            when(font.getWidth(anyInt())).thenReturn(0f);
            when(font.getWidthFromFont(anyInt())).thenThrow(new IOException("no font width"));
            when(font.getAverageFontWidth()).thenReturn(400f);

            float width = WidthCalculator.calculateAccurateWidth(font, "A", 10f);

            // 400/1000 * 10 = 4.
            assertThat(width).isCloseTo(4f, within(0.01f));
        }
    }

    @Nested
    @DisplayName("Bounding-box and conservative fallbacks")
    class FallbackTests {

        @Test
        @DisplayName("Uses bounding box estimate when characters cannot be encoded")
        void boundingBoxEstimateWhenEncodingFails() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("BBoxFont");
            // canEncodeCharacters fails outright.
            when(font.encode(anyString())).thenThrow(new IOException("cannot encode"));
            PDFontDescriptor descriptor = mock(PDFontDescriptor.class);
            when(font.getFontDescriptor()).thenReturn(descriptor);
            when(descriptor.getFontBoundingBox()).thenReturn(new PDRectangle(0, 0, 1000, 800));

            float width = WidthCalculator.calculateAccurateWidth(font, "abc", 10f);

            assertThat(width).isGreaterThan(0f);
        }

        @Test
        @DisplayName("Uses average-width fallback when no bounding box is present")
        void averageWidthFallbackWhenNoBoundingBox() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("NoBBoxFont");
            when(font.encode(anyString())).thenThrow(new IOException("cannot encode"));
            when(font.getFontDescriptor()).thenReturn(null);
            when(font.getAverageFontWidth()).thenReturn(500f);

            float width = WidthCalculator.calculateAccurateWidth(font, "abcd", 10f);

            // 4 chars * 500/1000 * 10 = 20.
            assertThat(width).isCloseTo(20f, within(0.01f));
        }

        @Test
        @DisplayName("Uses conservative estimate when every fallback throws")
        void conservativeEstimateWhenEverythingThrows() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("BrokenFont");
            when(font.encode(anyString())).thenThrow(new IOException("cannot encode"));
            // Bounding box path throws, then average width path also throws.
            when(font.getFontDescriptor()).thenThrow(new RuntimeException("descriptor boom"));
            when(font.getAverageFontWidth()).thenThrow(new RuntimeException("avg boom"));

            float width = WidthCalculator.calculateAccurateWidth(font, "hello", 10f);

            // Conservative: length * 0.5 * fontSize = 5 * 0.5 * 10 = 25.
            assertThat(width).isCloseTo(25f, within(0.01f));
        }
    }

    @Nested
    @DisplayName("Reliability checks")
    class ReliabilityTests {

        @Test
        @DisplayName("Returns false for a font flagged with custom encoding")
        void falseForCustomEncoding() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("CustomEncFont");
            when(font.isDamaged()).thenReturn(false);

            try (var helper = org.mockito.Mockito.mockStatic(TextEncodingHelper.class)) {
                helper.when(() -> TextEncodingHelper.canCalculateBasicWidths(font))
                        .thenReturn(true);
                helper.when(() -> TextEncodingHelper.hasCustomEncoding(font)).thenReturn(true);

                assertThat(WidthCalculator.isWidthCalculationReliable(font)).isFalse();
            }
        }

        @Test
        @DisplayName("Returns true when basic widths work and encoding is standard")
        void trueForStandardEncoding() throws IOException {
            PDFont font = mock(PDFont.class);
            when(font.getName()).thenReturn("StdFont");
            when(font.isDamaged()).thenReturn(false);

            try (var helper = org.mockito.Mockito.mockStatic(TextEncodingHelper.class)) {
                helper.when(() -> TextEncodingHelper.canCalculateBasicWidths(font))
                        .thenReturn(true);
                helper.when(() -> TextEncodingHelper.hasCustomEncoding(font)).thenReturn(false);

                assertThat(WidthCalculator.isWidthCalculationReliable(font)).isTrue();
            }
        }
    }
}
