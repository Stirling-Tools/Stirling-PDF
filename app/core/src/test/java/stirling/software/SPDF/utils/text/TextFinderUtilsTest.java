package stirling.software.SPDF.utils.text;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TextFinderUtilsTest {

    // --- validateFontReliability ---

    @Test
    void validateFontReliability_withNull_returnsFalse() {
        assertFalse(TextFinderUtils.validateFontReliability(null));
    }

    @Test
    void validateFontReliability_withWorkingFont_returnsTrue() throws IOException {
        PDFont font = mock(PDFont.class);
        when(font.getStringWidth(" ")).thenReturn(250f);
        when(font.getStringWidth("a")).thenReturn(500f);
        when(font.getName()).thenReturn("TestFont");

        assertTrue(TextFinderUtils.validateFontReliability(font));
    }

    @Test
    void validateFontReliability_withFontThatCanEncodeBasicChars_returnsTrue() throws IOException {
        PDFont font = mock(PDFont.class);
        when(font.getName()).thenReturn("TestFont");

        // Use mockStatic since TextEncodingHelper has static methods
        try (var mockedHelper = mockStatic(TextEncodingHelper.class)) {
            mockedHelper
                    .when(() -> TextEncodingHelper.canCalculateBasicWidths(font))
                    .thenReturn(false);
            mockedHelper
                    .when(() -> TextEncodingHelper.canEncodeCharacters(eq(font), anyString()))
                    .thenReturn(true);
            assertTrue(TextFinderUtils.validateFontReliability(font));
        }
    }

    @Test
    void validateFontReliability_withTotallyBrokenFont_returnsFalse() throws IOException {
        PDFont font = mock(PDFont.class);
        when(font.getStringWidth(anyString())).thenThrow(new IOException("broken"));
        when(font.encode(anyString())).thenThrow(new IOException("broken"));
        when(font.getName()).thenReturn("BrokenFont");

        assertFalse(TextFinderUtils.validateFontReliability(font));
    }

    // --- createOptimizedSearchPatterns ---

    @Test
    void createOptimizedSearchPatterns_withLiteralTerm_createsPattern() {
        Set<String> terms = Set.of("hello");
        List<Pattern> patterns = TextFinderUtils.createOptimizedSearchPatterns(terms, false, false);

        assertEquals(1, patterns.size());
        assertTrue(patterns.get(0).matcher("hello").find());
        assertFalse(patterns.get(0).matcher("HELLO").find() == false); // case insensitive
    }

    @Test
    void createOptimizedSearchPatterns_withRegex_createsRegexPattern() {
        Set<String> terms = Set.of("hel+o");
        List<Pattern> patterns = TextFinderUtils.createOptimizedSearchPatterns(terms, true, false);

        assertEquals(1, patterns.size());
        assertTrue(patterns.get(0).matcher("hello").find());
        assertTrue(patterns.get(0).matcher("helo").find());
    }

    @Test
    void createOptimizedSearchPatterns_withWholeWord_addsWordBoundaries() {
        Set<String> terms = Set.of("cat");
        List<Pattern> patterns = TextFinderUtils.createOptimizedSearchPatterns(terms, false, true);

        assertEquals(1, patterns.size());
        assertTrue(patterns.get(0).matcher("the cat sat").find());
        assertFalse(patterns.get(0).matcher("concatenate").find());
    }

    @Test
    void createOptimizedSearchPatterns_withEmptyTerms_returnsEmptyList() {
        Set<String> terms = Collections.emptySet();
        List<Pattern> patterns = TextFinderUtils.createOptimizedSearchPatterns(terms, false, false);
        assertTrue(patterns.isEmpty());
    }

    @Test
    void createOptimizedSearchPatterns_skipsNullTerms() {
        Set<String> terms = new LinkedHashSet<>();
        terms.add(null);
        terms.add("valid");
        List<Pattern> patterns = TextFinderUtils.createOptimizedSearchPatterns(terms, false, false);

        assertEquals(1, patterns.size());
    }

    @Test
    void createOptimizedSearchPatterns_skipsBlankTerms() {
        Set<String> terms = Set.of("  ", "valid");
        List<Pattern> patterns = TextFinderUtils.createOptimizedSearchPatterns(terms, false, false);

        assertEquals(1, patterns.size());
    }

    @Test
    void createOptimizedSearchPatterns_withMultipleTerms_createsMultiplePatterns() {
        Set<String> terms = Set.of("hello", "world");
        List<Pattern> patterns = TextFinderUtils.createOptimizedSearchPatterns(terms, false, false);

        assertEquals(2, patterns.size());
    }

    @Test
    void createOptimizedSearchPatterns_wholeWordDigit_usesLookaround() {
        Set<String> terms = Set.of("5");
        List<Pattern> patterns = TextFinderUtils.createOptimizedSearchPatterns(terms, false, true);

        assertEquals(1, patterns.size());
        assertTrue(patterns.get(0).matcher("item 5 here").find());
    }

    // --- hasProblematicFonts ---

    @Test
    void hasProblematicFonts_withNullPage_returnsFalse() {
        assertFalse(TextFinderUtils.hasProblematicFonts(null));
    }

    @Test
    void hasProblematicFonts_withNullResources_returnsFalse() {
        PDPage page = mock(PDPage.class);
        when(page.getResources()).thenReturn(null);

        assertFalse(TextFinderUtils.hasProblematicFonts(page));
    }

    @Test
    void hasProblematicFonts_withNoFonts_returnsFalse() {
        PDPage page = mock(PDPage.class);
        PDResources resources = mock(PDResources.class);
        when(page.getResources()).thenReturn(resources);
        when(resources.getFontNames()).thenReturn(Collections.emptySet());

        assertFalse(TextFinderUtils.hasProblematicFonts(page));
    }
}
