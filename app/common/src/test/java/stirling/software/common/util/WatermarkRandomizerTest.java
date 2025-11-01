package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.awt.Color;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("WatermarkRandomizer Unit Tests")
class WatermarkRandomizerTest {

    private static final long TEST_SEED = 12345L;

    @Nested
    @DisplayName("Position Randomization Tests")
    class PositionRandomizationTests {

        @Test
        @DisplayName("Should generate deterministic random position with seed")
        void testGenerateRandomPositionWithSeed() {
            WatermarkRandomizer randomizer1 = new WatermarkRandomizer(TEST_SEED);
            WatermarkRandomizer randomizer2 = new WatermarkRandomizer(TEST_SEED);

            float[] pos1 =
                    randomizer1.generateRandomPosition(
                            800f, 600f, 100f, 50f, 10f, null, null, null, null);
            float[] pos2 =
                    randomizer2.generateRandomPosition(
                            800f, 600f, 100f, 50f, 10f, null, null, null, null);

            assertArrayEquals(pos1, pos2, "Same seed should produce same position");
        }

        @Test
        @DisplayName("Should respect margin constraints")
        void testGenerateRandomPositionWithMargin() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            float margin = 20f;
            float pageWidth = 800f;
            float pageHeight = 600f;
            float watermarkWidth = 100f;
            float watermarkHeight = 50f;

            for (int i = 0; i < 10; i++) {
                float[] pos =
                        randomizer.generateRandomPosition(
                                pageWidth,
                                pageHeight,
                                watermarkWidth,
                                watermarkHeight,
                                margin,
                                null,
                                null,
                                null,
                                null);

                assertTrue(pos[0] >= margin, "X position should respect margin");
                assertTrue(pos[1] >= margin, "Y position should respect margin");
                assertTrue(
                        pos[0] <= pageWidth - margin - watermarkWidth,
                        "X position should not exceed page width minus margin");
                assertTrue(
                        pos[1] <= pageHeight - margin - watermarkHeight,
                        "Y position should not exceed page height minus margin");
            }
        }

        @Test
        @DisplayName("Should respect custom bounds")
        void testGenerateRandomPositionWithBounds() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            float boundsX = 100f;
            float boundsY = 100f;
            float boundsWidth = 400f;
            float boundsHeight = 300f;
            float watermarkWidth = 50f;
            float watermarkHeight = 30f;

            for (int i = 0; i < 10; i++) {
                float[] pos =
                        randomizer.generateRandomPosition(
                                800f,
                                600f,
                                watermarkWidth,
                                watermarkHeight,
                                10f,
                                boundsX,
                                boundsY,
                                boundsWidth,
                                boundsHeight);

                assertTrue(pos[0] >= boundsX, "X position should be within bounds");
                assertTrue(pos[1] >= boundsY, "Y position should be within bounds");
                assertTrue(
                        pos[0] <= boundsX + boundsWidth - watermarkWidth,
                        "X position should not exceed bounds");
                assertTrue(
                        pos[1] <= boundsY + boundsHeight - watermarkHeight,
                        "Y position should not exceed bounds");
            }
        }

        @Test
        @DisplayName("Should generate grid positions correctly")
        void testGenerateGridPositions() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            float pageWidth = 800f;
            float pageHeight = 600f;
            float watermarkWidth = 100f;
            float watermarkHeight = 100f;
            int widthSpacer = 50;
            int heightSpacer = 50;
            int count = 5;

            List<float[]> positions =
                    randomizer.generateGridPositions(
                            pageWidth,
                            pageHeight,
                            watermarkWidth,
                            watermarkHeight,
                            widthSpacer,
                            heightSpacer,
                            count);

            assertNotNull(positions, "Positions should not be null");
            assertEquals(count, positions.size(), "Should generate requested count of positions");

            // Verify positions are within page bounds
            for (float[] pos : positions) {
                assertTrue(pos[0] >= 0 && pos[0] <= pageWidth, "X position within page width");
                assertTrue(pos[1] >= 0 && pos[1] <= pageHeight, "Y position within page height");
            }
        }

        @Test
        @DisplayName("Should generate unlimited grid when count is 0")
        void testGenerateGridPositionsUnlimited() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            float pageWidth = 400f;
            float pageHeight = 300f;
            float watermarkWidth = 100f;
            float watermarkHeight = 100f;

            List<float[]> positions =
                    randomizer.generateGridPositions(
                            pageWidth, pageHeight, watermarkWidth, watermarkHeight, 50, 50, 0);

            assertNotNull(positions, "Positions should not be null");
            assertTrue(positions.size() > 0, "Should generate at least one position");
        }
    }

    @Nested
    @DisplayName("Rotation Randomization Tests")
    class RotationRandomizationTests {

        @Test
        @DisplayName("Should generate deterministic rotation with seed")
        void testGenerateRandomRotationWithSeed() {
            WatermarkRandomizer randomizer1 = new WatermarkRandomizer(TEST_SEED);
            WatermarkRandomizer randomizer2 = new WatermarkRandomizer(TEST_SEED);

            float rotation1 = randomizer1.generateRandomRotation(0f, 360f);
            float rotation2 = randomizer2.generateRandomRotation(0f, 360f);

            assertEquals(rotation1, rotation2, "Same seed should produce same rotation");
        }

        @Test
        @DisplayName("Should generate rotation within range")
        void testGenerateRandomRotationInRange() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            float minRotation = -45f;
            float maxRotation = 45f;

            for (int i = 0; i < 20; i++) {
                float rotation = randomizer.generateRandomRotation(minRotation, maxRotation);
                assertTrue(
                        rotation >= minRotation && rotation <= maxRotation,
                        "Rotation should be within specified range");
            }
        }

        @Test
        @DisplayName("Should return fixed rotation when min equals max")
        void testGenerateRandomRotationFixed() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            float fixedRotation = 30f;

            float rotation = randomizer.generateRandomRotation(fixedRotation, fixedRotation);

            assertEquals(
                    fixedRotation, rotation, "Should return fixed rotation when min equals max");
        }

        @Test
        @DisplayName("Should generate per-letter rotation within symmetric range")
        void testGeneratePerLetterRotation() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            float maxRotation = 30f;

            for (int i = 0; i < 20; i++) {
                float rotation = randomizer.generatePerLetterRotation(maxRotation);
                assertTrue(
                        rotation >= -maxRotation && rotation <= maxRotation,
                        "Per-letter rotation should be within +/- maxRotation");
            }
        }

        @Test
        @DisplayName("Should generate per-letter rotation in specified range")
        void testGeneratePerLetterRotationInRange() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            float minRotation = -15f;
            float maxRotation = 45f;

            for (int i = 0; i < 20; i++) {
                float rotation =
                        randomizer.generatePerLetterRotationInRange(minRotation, maxRotation);
                assertTrue(
                        rotation >= minRotation && rotation <= maxRotation,
                        "Per-letter rotation should be within specified range");
            }
        }

        @Test
        @DisplayName("Should return fixed per-letter rotation when min equals max")
        void testGeneratePerLetterRotationInRangeFixed() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            float fixedRotation = 20f;

            float rotation =
                    randomizer.generatePerLetterRotationInRange(fixedRotation, fixedRotation);

            assertEquals(
                    fixedRotation, rotation, "Should return fixed rotation when min equals max");
        }
    }

    @Nested
    @DisplayName("Mirroring Randomization Tests")
    class MirroringRandomizationTests {

        @Test
        @DisplayName("Should generate deterministic mirroring decision with seed")
        void testShouldMirrorWithSeed() {
            WatermarkRandomizer randomizer1 = new WatermarkRandomizer(TEST_SEED);
            WatermarkRandomizer randomizer2 = new WatermarkRandomizer(TEST_SEED);

            boolean mirror1 = randomizer1.shouldMirror(0.5f);
            boolean mirror2 = randomizer2.shouldMirror(0.5f);

            assertEquals(mirror1, mirror2, "Same seed should produce same mirroring decision");
        }

        @Test
        @DisplayName("Should always mirror with probability 1.0")
        void testShouldMirrorAlways() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);

            for (int i = 0; i < 10; i++) {
                assertTrue(
                        randomizer.shouldMirror(1.0f), "Should always mirror with probability 1.0");
            }
        }

        @Test
        @DisplayName("Should never mirror with probability 0.0")
        void testShouldMirrorNever() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);

            for (int i = 0; i < 10; i++) {
                assertFalse(
                        randomizer.shouldMirror(0.0f), "Should never mirror with probability 0.0");
            }
        }

        @Test
        @DisplayName("Should mirror approximately 50% of the time with probability 0.5")
        void testShouldMirrorProbability() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            int mirrorCount = 0;
            int iterations = 100;

            for (int i = 0; i < iterations; i++) {
                if (randomizer.shouldMirror(0.5f)) {
                    mirrorCount++;
                }
            }

            // Allow some variance (30-70%)
            assertTrue(
                    mirrorCount >= 30 && mirrorCount <= 70,
                    "Should mirror approximately 50% of the time");
        }
    }

    @Nested
    @DisplayName("Font Randomization Tests")
    class FontRandomizationTests {

        @Test
        @DisplayName("Should select deterministic font with seed")
        void testSelectRandomFontWithSeed() {
            WatermarkRandomizer randomizer1 = new WatermarkRandomizer(TEST_SEED);
            WatermarkRandomizer randomizer2 = new WatermarkRandomizer(TEST_SEED);
            List<String> fonts = Arrays.asList("Arial", "Times", "Courier");

            String font1 = randomizer1.selectRandomFont(fonts);
            String font2 = randomizer2.selectRandomFont(fonts);

            assertEquals(font1, font2, "Same seed should produce same font selection");
        }

        @Test
        @DisplayName("Should select font from provided list")
        void testSelectRandomFontFromList() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            List<String> fonts = Arrays.asList("Arial", "Times", "Courier");

            for (int i = 0; i < 10; i++) {
                String font = randomizer.selectRandomFont(fonts);
                assertTrue(fonts.contains(font), "Selected font should be from the provided list");
            }
        }

        @Test
        @DisplayName("Should return default when font list is empty")
        void testSelectRandomFontEmpty() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            List<String> fonts = Arrays.asList();

            String font = randomizer.selectRandomFont(fonts);

            assertEquals("default", font, "Should return 'default' when list is empty");
        }

        @Test
        @DisplayName("Should return default when font list is null")
        void testSelectRandomFontNull() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);

            String font = randomizer.selectRandomFont(null);

            assertEquals("default", font, "Should return 'default' when list is null");
        }

        @Test
        @DisplayName("Should select font from count")
        void testSelectRandomFontFromCount() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            int fontCount = 5;

            for (int i = 0; i < 10; i++) {
                String font = randomizer.selectRandomFontFromCount(fontCount);
                assertNotNull(font, "Selected font should not be null");
                assertFalse(font.isEmpty(), "Selected font should not be empty");
            }
        }

        @Test
        @DisplayName("Should handle font count exceeding available fonts")
        void testSelectRandomFontFromCountExceedsAvailable() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            int fontCount = 100; // More than available

            String font = randomizer.selectRandomFontFromCount(fontCount);

            assertNotNull(font, "Should still return a valid font");
        }
    }

    @Nested
    @DisplayName("Font Size Randomization Tests")
    class FontSizeRandomizationTests {

        @Test
        @DisplayName("Should generate deterministic font size with seed")
        void testGenerateRandomFontSizeWithSeed() {
            WatermarkRandomizer randomizer1 = new WatermarkRandomizer(TEST_SEED);
            WatermarkRandomizer randomizer2 = new WatermarkRandomizer(TEST_SEED);

            float size1 = randomizer1.generateRandomFontSize(10f, 50f);
            float size2 = randomizer2.generateRandomFontSize(10f, 50f);

            assertEquals(size1, size2, "Same seed should produce same font size");
        }

        @Test
        @DisplayName("Should generate font size within range")
        void testGenerateRandomFontSizeInRange() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            float minSize = 10f;
            float maxSize = 50f;

            for (int i = 0; i < 20; i++) {
                float size = randomizer.generateRandomFontSize(minSize, maxSize);
                assertTrue(
                        size >= minSize && size <= maxSize,
                        "Font size should be within specified range");
            }
        }

        @Test
        @DisplayName("Should return fixed font size when min equals max")
        void testGenerateRandomFontSizeFixed() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            float fixedSize = 30f;

            float size = randomizer.generateRandomFontSize(fixedSize, fixedSize);

            assertEquals(fixedSize, size, "Should return fixed size when min equals max");
        }
    }

    @Nested
    @DisplayName("Color Randomization Tests")
    class ColorRandomizationTests {

        @Test
        @DisplayName("Should generate deterministic color with seed")
        void testGenerateRandomColorWithSeed() {
            WatermarkRandomizer randomizer1 = new WatermarkRandomizer(TEST_SEED);
            WatermarkRandomizer randomizer2 = new WatermarkRandomizer(TEST_SEED);

            Color color1 = randomizer1.generateRandomColor(false);
            Color color2 = randomizer2.generateRandomColor(false);

            assertEquals(color1, color2, "Same seed should produce same color");
        }

        @Test
        @DisplayName("Should generate color from palette")
        void testGenerateRandomColorFromPalette() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            Color[] expectedPalette = {
                Color.BLACK,
                Color.DARK_GRAY,
                Color.GRAY,
                Color.LIGHT_GRAY,
                Color.RED,
                Color.BLUE,
                Color.GREEN,
                Color.ORANGE,
                Color.MAGENTA,
                Color.CYAN,
                Color.PINK,
                Color.YELLOW
            };

            for (int i = 0; i < 20; i++) {
                Color color = randomizer.generateRandomColor(true);
                boolean inPalette = false;
                for (Color paletteColor : expectedPalette) {
                    if (color.equals(paletteColor)) {
                        inPalette = true;
                        break;
                    }
                }
                assertTrue(inPalette, "Color should be from predefined palette");
            }
        }

        @Test
        @DisplayName("Should generate RGB color when not using palette")
        void testGenerateRandomColorRGB() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);

            for (int i = 0; i < 10; i++) {
                Color color = randomizer.generateRandomColor(false);
                assertNotNull(color, "Color should not be null");
                assertTrue(color.getRed() >= 0 && color.getRed() <= 255, "Red component valid");
                assertTrue(
                        color.getGreen() >= 0 && color.getGreen() <= 255, "Green component valid");
                assertTrue(color.getBlue() >= 0 && color.getBlue() <= 255, "Blue component valid");
            }
        }

        @Test
        @DisplayName("Should generate color from limited palette")
        void testGenerateRandomColorFromPaletteWithCount() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            int colorCount = 4;

            for (int i = 0; i < 10; i++) {
                Color color = randomizer.generateRandomColorFromPalette(colorCount);
                assertNotNull(color, "Color should not be null");
            }
        }

        @Test
        @DisplayName("Should handle color count exceeding palette size")
        void testGenerateRandomColorFromPaletteExceedsSize() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            int colorCount = 100; // More than palette size

            Color color = randomizer.generateRandomColorFromPalette(colorCount);

            assertNotNull(color, "Should still return a valid color");
        }

        @Test
        @DisplayName("Should handle color count of 1")
        void testGenerateRandomColorFromPaletteCountOne() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);

            Color color = randomizer.generateRandomColorFromPalette(1);

            assertEquals(Color.BLACK, color, "Should return first color in palette");
        }
    }

    @Nested
    @DisplayName("Shading Randomization Tests")
    class ShadingRandomizationTests {

        @Test
        @DisplayName("Should select deterministic shading with seed")
        void testSelectRandomShadingWithSeed() {
            WatermarkRandomizer randomizer1 = new WatermarkRandomizer(TEST_SEED);
            WatermarkRandomizer randomizer2 = new WatermarkRandomizer(TEST_SEED);
            List<String> shadings = Arrays.asList("none", "light", "dark");

            String shading1 = randomizer1.selectRandomShading(shadings);
            String shading2 = randomizer2.selectRandomShading(shadings);

            assertEquals(shading1, shading2, "Same seed should produce same shading selection");
        }

        @Test
        @DisplayName("Should select shading from provided list")
        void testSelectRandomShadingFromList() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            List<String> shadings = Arrays.asList("none", "light", "dark");

            for (int i = 0; i < 10; i++) {
                String shading = randomizer.selectRandomShading(shadings);
                assertTrue(
                        shadings.contains(shading),
                        "Selected shading should be from the provided list");
            }
        }

        @Test
        @DisplayName("Should return 'none' when shading list is empty")
        void testSelectRandomShadingEmpty() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);
            List<String> shadings = Arrays.asList();

            String shading = randomizer.selectRandomShading(shadings);

            assertEquals("none", shading, "Should return 'none' when list is empty");
        }

        @Test
        @DisplayName("Should return 'none' when shading list is null")
        void testSelectRandomShadingNull() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);

            String shading = randomizer.selectRandomShading(null);

            assertEquals("none", shading, "Should return 'none' when list is null");
        }
    }

    @Nested
    @DisplayName("Random Instance Tests")
    class RandomInstanceTests {

        @Test
        @DisplayName("Should return non-null Random instance")
        void testGetRandom() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(TEST_SEED);

            assertNotNull(randomizer.getRandom(), "Random instance should not be null");
        }

        @Test
        @DisplayName("Should use seeded Random for deterministic behavior")
        void testSeededRandomBehavior() {
            WatermarkRandomizer randomizer1 = new WatermarkRandomizer(TEST_SEED);
            WatermarkRandomizer randomizer2 = new WatermarkRandomizer(TEST_SEED);

            int value1 = randomizer1.getRandom().nextInt(100);
            int value2 = randomizer2.getRandom().nextInt(100);

            assertEquals(value1, value2, "Seeded Random should produce same values");
        }

        @Test
        @DisplayName("Should use non-deterministic Random when seed is null")
        void testNonSeededRandomBehavior() {
            WatermarkRandomizer randomizer = new WatermarkRandomizer(null);

            assertNotNull(
                    randomizer.getRandom(), "Random instance should not be null even without seed");
        }
    }
}
