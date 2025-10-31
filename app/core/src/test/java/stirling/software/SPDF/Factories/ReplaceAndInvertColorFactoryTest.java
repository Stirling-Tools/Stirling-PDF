package stirling.software.SPDF.Factories;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.api.misc.HighContrastColorCombination;
import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.common.util.misc.ColorSpaceConversionStrategy;
import stirling.software.common.util.misc.CustomColorReplaceStrategy;
import stirling.software.common.util.misc.InvertFullColorStrategy;
import stirling.software.common.util.misc.ReplaceAndInvertColorStrategy;

class ReplaceAndInvertColorFactoryTest {

    private ReplaceAndInvertColorFactory factory;
    private MultipartFile file;

    @BeforeEach
    void setup() {
        factory = new ReplaceAndInvertColorFactory(null);
        file = mock(MultipartFile.class);
    }

    @Test
    void whenCustomColor_thenReturnsCustomColorReplaceStrategy() {
        ReplaceAndInvert option = ReplaceAndInvert.CUSTOM_COLOR;
        HighContrastColorCombination combo = null; // not used for CUSTOM_COLOR

        ReplaceAndInvertColorStrategy strategy =
                factory.replaceAndInvert(file, option, combo, "#FFFFFF", "#000000");

        assertNotNull(strategy);
        assertTrue(
                strategy instanceof CustomColorReplaceStrategy,
                "Expected CustomColorReplaceStrategy for CUSTOM_COLOR");
    }

    @Test
    void whenHighContrastColor_thenReturnsCustomColorReplaceStrategy() {
        ReplaceAndInvert option = ReplaceAndInvert.HIGH_CONTRAST_COLOR;
        HighContrastColorCombination combo = null;

        ReplaceAndInvertColorStrategy strategy =
                factory.replaceAndInvert(file, option, combo, "#FFFFFF", "#000000");

        assertNotNull(strategy);
        assertTrue(
                strategy instanceof CustomColorReplaceStrategy,
                "Expected CustomColorReplaceStrategy for HIGH_CONTRAST_COLOR");
    }

    @Test
    void whenFullInversion_thenReturnsInvertFullColorStrategy() {
        ReplaceAndInvert option = ReplaceAndInvert.FULL_INVERSION;

        ReplaceAndInvertColorStrategy strategy =
                factory.replaceAndInvert(file, option, null, null, null);

        assertNotNull(strategy);
        assertTrue(
                strategy instanceof InvertFullColorStrategy,
                "Expected InvertFullColorStrategy for FULL_INVERSION");
    }

    @Test
    void whenColorSpaceConversion_thenReturnsColorSpaceConversionStrategy() {
        ReplaceAndInvert option = ReplaceAndInvert.COLOR_SPACE_CONVERSION;

        ReplaceAndInvertColorStrategy strategy =
                factory.replaceAndInvert(file, option, null, null, null);

        assertNotNull(strategy);
        assertTrue(
                strategy instanceof ColorSpaceConversionStrategy,
                "Expected ColorSpaceConversionStrategy for COLOR_SPACE_CONVERSION");
    }

    @Test
    void whenNullOption_thenReturnsNull() {
        ReplaceAndInvertColorStrategy strategy =
                factory.replaceAndInvert(file, null, null, null, null);
        assertNull(strategy, "Expected null for unsupported/unknown option");
    }
}
