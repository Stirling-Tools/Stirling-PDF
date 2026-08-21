package stirling.software.SPDF.service.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.InputStreamResource;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.Factories.ReplaceAndInvertColorFactory;
import stirling.software.common.model.api.misc.HighContrastColorCombination;
import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.common.util.misc.ReplaceAndInvertColorStrategy;

@ExtendWith(MockitoExtension.class)
class ReplaceAndInvertColorServiceExtendedTest {

    @Mock private ReplaceAndInvertColorFactory replaceAndInvertColorFactory;
    @Mock private MultipartFile file;
    @InjectMocks private ReplaceAndInvertColorService service;

    @Test
    void replaceAndInvertColor_delegatesToFactoryAndStrategy() throws IOException {
        ReplaceAndInvert option = mock(ReplaceAndInvert.class);
        HighContrastColorCombination combo = mock(HighContrastColorCombination.class);
        ReplaceAndInvertColorStrategy strategy = mock(ReplaceAndInvertColorStrategy.class);
        InputStreamResource expected = mock(InputStreamResource.class);

        when(replaceAndInvertColorFactory.replaceAndInvert(file, option, combo, "#FFF", "#000"))
                .thenReturn(strategy);
        when(strategy.replace()).thenReturn(expected);

        InputStreamResource result =
                service.replaceAndInvertColor(file, option, combo, "#FFF", "#000");

        assertSame(expected, result);
        verify(replaceAndInvertColorFactory).replaceAndInvert(file, option, combo, "#FFF", "#000");
        verify(strategy).replace();
    }

    @Test
    void replaceAndInvertColor_withNullColors() throws IOException {
        ReplaceAndInvert option = mock(ReplaceAndInvert.class);
        HighContrastColorCombination combo = mock(HighContrastColorCombination.class);
        ReplaceAndInvertColorStrategy strategy = mock(ReplaceAndInvertColorStrategy.class);
        InputStreamResource expected = mock(InputStreamResource.class);

        when(replaceAndInvertColorFactory.replaceAndInvert(file, option, combo, null, null))
                .thenReturn(strategy);
        when(strategy.replace()).thenReturn(expected);

        InputStreamResource result = service.replaceAndInvertColor(file, option, combo, null, null);
        assertSame(expected, result);
    }

    @Test
    void replaceAndInvertColor_factoryReturnsNull_throwsNPE() {
        ReplaceAndInvert option = mock(ReplaceAndInvert.class);
        HighContrastColorCombination combo = mock(HighContrastColorCombination.class);

        when(replaceAndInvertColorFactory.replaceAndInvert(file, option, combo, "#FFF", "#000"))
                .thenReturn(null);

        assertThrows(
                NullPointerException.class,
                () -> service.replaceAndInvertColor(file, option, combo, "#FFF", "#000"));
    }

    @Test
    void replaceAndInvertColor_strategyThrowsIOException_propagates() throws IOException {
        ReplaceAndInvert option = mock(ReplaceAndInvert.class);
        HighContrastColorCombination combo = mock(HighContrastColorCombination.class);
        ReplaceAndInvertColorStrategy strategy = mock(ReplaceAndInvertColorStrategy.class);

        when(replaceAndInvertColorFactory.replaceAndInvert(file, option, combo, "#FFF", "#000"))
                .thenReturn(strategy);
        when(strategy.replace()).thenThrow(new IOException("Strategy error"));

        assertThrows(
                IOException.class,
                () -> service.replaceAndInvertColor(file, option, combo, "#FFF", "#000"));
    }

    @Test
    void replaceAndInvertColor_withDifferentColorValues() throws IOException {
        ReplaceAndInvert option = mock(ReplaceAndInvert.class);
        HighContrastColorCombination combo = mock(HighContrastColorCombination.class);
        ReplaceAndInvertColorStrategy strategy = mock(ReplaceAndInvertColorStrategy.class);
        InputStreamResource expected = mock(InputStreamResource.class);

        when(replaceAndInvertColorFactory.replaceAndInvert(
                        file, option, combo, "#123456", "#ABCDEF"))
                .thenReturn(strategy);
        when(strategy.replace()).thenReturn(expected);

        InputStreamResource result =
                service.replaceAndInvertColor(file, option, combo, "#123456", "#ABCDEF");
        assertSame(expected, result);
    }

    @Test
    void replaceAndInvertColor_withEmptyColors() throws IOException {
        ReplaceAndInvert option = mock(ReplaceAndInvert.class);
        HighContrastColorCombination combo = mock(HighContrastColorCombination.class);
        ReplaceAndInvertColorStrategy strategy = mock(ReplaceAndInvertColorStrategy.class);
        InputStreamResource expected = mock(InputStreamResource.class);

        when(replaceAndInvertColorFactory.replaceAndInvert(file, option, combo, "", ""))
                .thenReturn(strategy);
        when(strategy.replace()).thenReturn(expected);

        InputStreamResource result = service.replaceAndInvertColor(file, option, combo, "", "");
        assertSame(expected, result);
    }

    @Test
    void replaceAndInvertColor_withNullOption_delegatesAsIs() throws IOException {
        HighContrastColorCombination combo = mock(HighContrastColorCombination.class);
        ReplaceAndInvertColorStrategy strategy = mock(ReplaceAndInvertColorStrategy.class);
        InputStreamResource expected = mock(InputStreamResource.class);

        when(replaceAndInvertColorFactory.replaceAndInvert(file, null, combo, "#FFF", "#000"))
                .thenReturn(strategy);
        when(strategy.replace()).thenReturn(expected);

        InputStreamResource result =
                service.replaceAndInvertColor(file, null, combo, "#FFF", "#000");
        assertSame(expected, result);
    }

    @Test
    void replaceAndInvertColor_withNullCombo_delegatesAsIs() throws IOException {
        ReplaceAndInvert option = mock(ReplaceAndInvert.class);
        ReplaceAndInvertColorStrategy strategy = mock(ReplaceAndInvertColorStrategy.class);
        InputStreamResource expected = mock(InputStreamResource.class);

        when(replaceAndInvertColorFactory.replaceAndInvert(file, option, null, "#FFF", "#000"))
                .thenReturn(strategy);
        when(strategy.replace()).thenReturn(expected);

        InputStreamResource result =
                service.replaceAndInvertColor(file, option, null, "#FFF", "#000");
        assertSame(expected, result);
    }
}
