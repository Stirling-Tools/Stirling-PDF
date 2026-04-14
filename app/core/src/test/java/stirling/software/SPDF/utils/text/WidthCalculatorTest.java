package stirling.software.SPDF.utils.text;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDFontDescriptor;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WidthCalculatorTest {

    // --- calculateAccurateWidth ---

    @Test
    void calculateAccurateWidth_withNullFont_returnsZero() {
        assertEquals(0f, WidthCalculator.calculateAccurateWidth(null, "text", 12f));
    }

    @Test
    void calculateAccurateWidth_withNullText_returnsZero() {
        PDFont font = mock(PDFont.class);
        assertEquals(0f, WidthCalculator.calculateAccurateWidth(font, null, 12f));
    }

    @Test
    void calculateAccurateWidth_withEmptyText_returnsZero() {
        PDFont font = mock(PDFont.class);
        assertEquals(0f, WidthCalculator.calculateAccurateWidth(font, "", 12f));
    }

    @Test
    void calculateAccurateWidth_withZeroFontSize_returnsZero() {
        PDFont font = mock(PDFont.class);
        assertEquals(0f, WidthCalculator.calculateAccurateWidth(font, "text", 0f));
    }

    @Test
    void calculateAccurateWidth_withNegativeFontSize_returnsZero() {
        PDFont font = mock(PDFont.class);
        assertEquals(0f, WidthCalculator.calculateAccurateWidth(font, "text", -5f));
    }

    @Test
    void calculateAccurateWidth_withValidFont_returnsScaledWidth() throws IOException {
        PDFont font = mock(PDFont.class);
        when(font.getName()).thenReturn("TestFont");
        // canEncodeCharacters needs encode to succeed
        when(font.encode("Hello")).thenReturn(new byte[] {72, 101, 108, 108, 111});
        when(font.getStringWidth("Hello")).thenReturn(2500f);

        float result = WidthCalculator.calculateAccurateWidth(font, "Hello", 12f);

        // 2500 / 1000 * 12 = 30.0
        assertEquals(30.0f, result, 0.01f);
    }

    @Test
    void calculateAccurateWidth_whenEncodeFails_usesFallback() throws IOException {
        PDFont font = mock(PDFont.class);
        when(font.getName()).thenReturn("TestFont");
        // canEncodeCharacters fails
        when(font.encode(anyString())).thenThrow(new IOException("fail"));
        // fallback uses font descriptor or average width
        when(font.getAverageFontWidth()).thenReturn(500f);
        PDFontDescriptor descriptor = mock(PDFontDescriptor.class);
        when(font.getFontDescriptor()).thenReturn(descriptor);
        when(descriptor.getFontBoundingBox()).thenReturn(new PDRectangle(0, 0, 1000, 800));

        float result = WidthCalculator.calculateAccurateWidth(font, "Hi", 10f);

        assertTrue(result > 0, "Should return a positive fallback width");
    }

    // --- isWidthCalculationReliable ---

    @Test
    void isWidthCalculationReliable_withNullFont_returnsFalse() {
        assertFalse(WidthCalculator.isWidthCalculationReliable(null));
    }

    @Test
    void isWidthCalculationReliable_withDamagedFont_returnsFalse() {
        PDFont font = mock(PDFont.class);
        when(font.isDamaged()).thenReturn(true);
        when(font.getName()).thenReturn("DamagedFont");

        assertFalse(WidthCalculator.isWidthCalculationReliable(font));
    }

    @Test
    void isWidthCalculationReliable_whenCannotCalculateWidths_returnsFalse() throws IOException {
        PDFont font = mock(PDFont.class);
        when(font.isDamaged()).thenReturn(false);
        when(font.getStringWidth(anyString())).thenThrow(new IOException("fail"));
        when(font.getName()).thenReturn("BrokenFont");

        assertFalse(WidthCalculator.isWidthCalculationReliable(font));
    }

    @Test
    void isWidthCalculationReliable_withWorkingNonCustomFont_returnsTrue() throws IOException {
        PDFont font = mock(PDFont.class);
        when(font.isDamaged()).thenReturn(false);
        when(font.getStringWidth(" ")).thenReturn(250f);
        when(font.getStringWidth("a")).thenReturn(500f);
        when(font.getName()).thenReturn("TestFont");

        assertTrue(WidthCalculator.isWidthCalculationReliable(font));
    }
}
