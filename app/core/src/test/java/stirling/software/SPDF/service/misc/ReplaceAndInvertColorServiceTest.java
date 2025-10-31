package stirling.software.SPDF.service.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.core.io.InputStreamResource;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.Factories.ReplaceAndInvertColorFactory;
import stirling.software.common.model.api.misc.HighContrastColorCombination;
import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.common.util.misc.ReplaceAndInvertColorStrategy;

class ReplaceAndInvertColorServiceTest {

    @Mock private ReplaceAndInvertColorFactory replaceAndInvertColorFactory;

    @Mock private MultipartFile file;

    @Mock private ReplaceAndInvertColorStrategy replaceAndInvertColorStrategy;

    @InjectMocks private ReplaceAndInvertColorService replaceAndInvertColorService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
    }

    @Test
    void testReplaceAndInvertColor() throws IOException {
        // Arrange
        ReplaceAndInvert replaceAndInvertOption = mock(ReplaceAndInvert.class);
        HighContrastColorCombination highContrastColorCombination =
                mock(HighContrastColorCombination.class);
        String backGroundColor = "#FFFFFF";
        String textColor = "#000000";

        when(replaceAndInvertColorFactory.replaceAndInvert(
                        file,
                        replaceAndInvertOption,
                        highContrastColorCombination,
                        backGroundColor,
                        textColor))
                .thenReturn(replaceAndInvertColorStrategy);

        InputStreamResource expectedResource = mock(InputStreamResource.class);
        when(replaceAndInvertColorStrategy.replace()).thenReturn(expectedResource);

        // Act
        InputStreamResource result =
                replaceAndInvertColorService.replaceAndInvertColor(
                        file,
                        replaceAndInvertOption,
                        highContrastColorCombination,
                        backGroundColor,
                        textColor);

        // Assert
        assertNotNull(result);
        assertEquals(expectedResource, result);
        verify(replaceAndInvertColorFactory, times(1))
                .replaceAndInvert(
                        file,
                        replaceAndInvertOption,
                        highContrastColorCombination,
                        backGroundColor,
                        textColor);
        verify(replaceAndInvertColorStrategy, times(1)).replace();
    }
}
