package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.awt.Dimension;
import java.awt.Font;
import java.awt.Image;
import java.awt.Insets;
import java.awt.Toolkit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

class UIScalingTest {

    private MockedStatic<Toolkit> mockedToolkit;
    private Toolkit mockedDefaultToolkit;

    @BeforeEach
    void setUp() {
        // Set up mocking of Toolkit
        mockedToolkit = mockStatic(Toolkit.class);
        mockedDefaultToolkit = Mockito.mock(Toolkit.class);

        // Return mocked toolkit when Toolkit.getDefaultToolkit() is called
        mockedToolkit.when(Toolkit::getDefaultToolkit).thenReturn(mockedDefaultToolkit);
    }

    @AfterEach
    void tearDown() {
        if (mockedToolkit != null) {
            mockedToolkit.close();
        }
    }

    @Test
    void testGetWidthScaleFactor() {
        // Arrange
        Dimension screenSize = new Dimension(3840, 2160); // 4K resolution
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);

        // Act
        double scaleFactor = UIScaling.getWidthScaleFactor();

        // Assert
        assertEquals(2.0, scaleFactor, 0.001, "Scale factor should be 2.0 for 4K width");
        verify(mockedDefaultToolkit, times(1)).getScreenSize();
    }

    @Test
    void testGetHeightScaleFactor() {
        // Arrange
        Dimension screenSize = new Dimension(3840, 2160); // 4K resolution
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);

        // Act
        double scaleFactor = UIScaling.getHeightScaleFactor();

        // Assert
        assertEquals(2.0, scaleFactor, 0.001, "Scale factor should be 2.0 for 4K height");
        verify(mockedDefaultToolkit, times(1)).getScreenSize();
    }

    @Test
    void testGetWidthScaleFactor_HD() {
        // Arrange - HD resolution
        Dimension screenSize = new Dimension(1920, 1080);
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);

        // Act
        double scaleFactor = UIScaling.getWidthScaleFactor();

        // Assert
        assertEquals(1.0, scaleFactor, 0.001, "Scale factor should be 1.0 for HD width");
    }

    @Test
    void testGetHeightScaleFactor_HD() {
        // Arrange - HD resolution
        Dimension screenSize = new Dimension(1920, 1080);
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);

        // Act
        double scaleFactor = UIScaling.getHeightScaleFactor();

        // Assert
        assertEquals(1.0, scaleFactor, 0.001, "Scale factor should be 1.0 for HD height");
    }

    @Test
    void testGetWidthScaleFactor_SmallScreen() {
        // Arrange - Small screen
        Dimension screenSize = new Dimension(1366, 768);
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);

        // Act
        double scaleFactor = UIScaling.getWidthScaleFactor();

        // Assert
        assertEquals(0.711, scaleFactor, 0.001, "Scale factor should be ~0.711 for 1366x768 width");
    }

    @Test
    void testGetHeightScaleFactor_SmallScreen() {
        // Arrange - Small screen
        Dimension screenSize = new Dimension(1366, 768);
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);

        // Act
        double scaleFactor = UIScaling.getHeightScaleFactor();

        // Assert
        assertEquals(
                0.711, scaleFactor, 0.001, "Scale factor should be ~0.711 for 1366x768 height");
    }

    @Test
    void testScaleWidth() {
        // Arrange
        Dimension screenSize = new Dimension(3840, 2160); // 4K resolution
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);

        // Act
        int scaledWidth = UIScaling.scaleWidth(100);

        // Assert
        assertEquals(200, scaledWidth, "Width should be scaled by factor of 2");
    }

    @Test
    void testScaleHeight() {
        // Arrange
        Dimension screenSize = new Dimension(3840, 2160); // 4K resolution
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);

        // Act
        int scaledHeight = UIScaling.scaleHeight(100);

        // Assert
        assertEquals(200, scaledHeight, "Height should be scaled by factor of 2");
    }

    @Test
    void testScaleWidth_SmallScreen() {
        // Arrange - Small screen
        Dimension screenSize = new Dimension(960, 540); // Half of HD
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);

        // Act
        int scaledWidth = UIScaling.scaleWidth(100);

        // Assert
        assertEquals(50, scaledWidth, "Width should be scaled by factor of 0.5");
    }

    @Test
    void testScaleHeight_SmallScreen() {
        // Arrange - Small screen
        Dimension screenSize = new Dimension(960, 540); // Half of HD
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);

        // Act
        int scaledHeight = UIScaling.scaleHeight(100);

        // Assert
        assertEquals(50, scaledHeight, "Height should be scaled by factor of 0.5");
    }

    @Test
    void testScaleDimension() {
        // Arrange
        Dimension screenSize = new Dimension(3840, 2160); // 4K resolution
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);
        Dimension originalDim = new Dimension(200, 150);

        // Act
        Dimension scaledDim = UIScaling.scale(originalDim);

        // Assert
        assertEquals(400, scaledDim.width, "Width should be scaled by factor of 2");
        assertEquals(300, scaledDim.height, "Height should be scaled by factor of 2");
        // Verify the original dimension is not modified
        assertEquals(200, originalDim.width, "Original width should remain unchanged");
        assertEquals(150, originalDim.height, "Original height should remain unchanged");
    }

    @Test
    void testScaleInsets() {
        // Arrange
        Dimension screenSize = new Dimension(3840, 2160); // 4K resolution
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);
        Insets originalInsets = new Insets(10, 20, 30, 40);

        // Act
        Insets scaledInsets = UIScaling.scale(originalInsets);

        // Assert
        assertEquals(20, scaledInsets.top, "Top inset should be scaled by factor of 2");
        assertEquals(40, scaledInsets.left, "Left inset should be scaled by factor of 2");
        assertEquals(60, scaledInsets.bottom, "Bottom inset should be scaled by factor of 2");
        assertEquals(80, scaledInsets.right, "Right inset should be scaled by factor of 2");
        // Verify the original insets are not modified
        assertEquals(10, originalInsets.top, "Original top inset should remain unchanged");
        assertEquals(20, originalInsets.left, "Original left inset should remain unchanged");
        assertEquals(30, originalInsets.bottom, "Original bottom inset should remain unchanged");
        assertEquals(40, originalInsets.right, "Original right inset should remain unchanged");
    }

    @Test
    void testScaleFont() {
        // Arrange
        Dimension screenSize = new Dimension(3840, 2160); // 4K resolution
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);
        Font originalFont = new Font("Arial", Font.PLAIN, 12);

        // Act
        Font scaledFont = UIScaling.scaleFont(originalFont);

        // Assert
        assertEquals(
                24.0f, scaledFont.getSize2D(), 0.001f, "Font size should be scaled by factor of 2");
        // Font family might be substituted by the system, so we don't test it
        assertEquals(Font.PLAIN, scaledFont.getStyle(), "Font style should remain unchanged");
    }

    @Test
    void testScaleFont_DifferentWidthHeightScales() {
        // Arrange - Different width and height scaling factors
        Dimension screenSize =
                new Dimension(2560, 1440); // 1.33x width, 1.33x height of base resolution
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);
        Font originalFont = new Font("Arial", Font.PLAIN, 12);

        // Act
        Font scaledFont = UIScaling.scaleFont(originalFont);

        // Assert
        // Should use the smaller of the two scale factors, which is the same in this case
        assertEquals(
                16.0f,
                scaledFont.getSize2D(),
                0.001f,
                "Font size should be scaled by factor of 1.33");
    }

    @Test
    void testScaleFont_UnevenScales() {
        // Arrange - different width and height scale factors
        Dimension screenSize = new Dimension(3840, 1080); // 2x width, 1x height
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);
        Font originalFont = new Font("Arial", Font.PLAIN, 12);

        // Act
        Font scaledFont = UIScaling.scaleFont(originalFont);

        // Assert - should use the smaller of the two scale factors (height in this case)
        assertEquals(
                12.0f,
                scaledFont.getSize2D(),
                0.001f,
                "Font size should be scaled by the smaller factor (1.0)");
    }

    @Test
    void testScaleIcon_NullIcon() {
        // Act
        Image result = UIScaling.scaleIcon(null, 100, 100);

        // Assert
        assertNull(result, "Should return null for null input");
    }

    @Test
    void testScaleIcon_SquareImage() {
        // Arrange
        Dimension screenSize = new Dimension(3840, 2160); // 4K resolution
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);

        // Create a mock square image
        Image mockImage = Mockito.mock(Image.class);
        when(mockImage.getWidth(null)).thenReturn(100);
        when(mockImage.getHeight(null)).thenReturn(100);
        when(mockImage.getScaledInstance(anyInt(), anyInt(), anyInt())).thenReturn(mockImage);

        // Act
        Image result = UIScaling.scaleIcon(mockImage, 100, 100);

        // Assert
        assertNotNull(result, "Should return a non-null result");
        verify(mockImage).getScaledInstance(eq(200), eq(200), eq(Image.SCALE_SMOOTH));
    }

    @Test
    void testScaleIcon_WideImage() {
        // Arrange
        Dimension screenSize = new Dimension(3840, 2160); // 4K resolution
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);

        // Create a mock image with a 2:1 aspect ratio (wide)
        Image mockImage = Mockito.mock(Image.class);
        when(mockImage.getWidth(null)).thenReturn(200);
        when(mockImage.getHeight(null)).thenReturn(100);
        when(mockImage.getScaledInstance(anyInt(), anyInt(), anyInt())).thenReturn(mockImage);

        // Act
        Image result = UIScaling.scaleIcon(mockImage, 100, 100);

        // Assert
        assertNotNull(result, "Should return a non-null result");
        // For a wide image (2:1), the width should be twice the height to maintain aspect ratio
        verify(mockImage).getScaledInstance(anyInt(), anyInt(), eq(Image.SCALE_SMOOTH));
    }

    @Test
    void testScaleIcon_TallImage() {
        // Arrange
        Dimension screenSize = new Dimension(3840, 2160); // 4K resolution
        when(mockedDefaultToolkit.getScreenSize()).thenReturn(screenSize);

        // Create a mock image with a 1:2 aspect ratio (tall)
        Image mockImage = Mockito.mock(Image.class);
        when(mockImage.getWidth(null)).thenReturn(100);
        when(mockImage.getHeight(null)).thenReturn(200);
        when(mockImage.getScaledInstance(anyInt(), anyInt(), anyInt())).thenReturn(mockImage);

        // Act
        Image result = UIScaling.scaleIcon(mockImage, 100, 100);

        // Assert
        assertNotNull(result, "Should return a non-null result");
        // For a tall image (1:2), the height should be twice the width to maintain aspect ratio
        verify(mockImage).getScaledInstance(anyInt(), anyInt(), eq(Image.SCALE_SMOOTH));
    }
}
