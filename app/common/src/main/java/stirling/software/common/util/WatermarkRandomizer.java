package stirling.software.common.util;

import java.awt.Color;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Utility class for generating randomized watermark attributes with deterministic (seedable)
 * randomness. Supports position, rotation, mirroring, font selection, size, color, and shading.
 */
public class WatermarkRandomizer {

    private final Random random;

    /**
     * Creates a WatermarkRandomizer with an optional seed for deterministic randomness.
     *
     * @param seed Optional seed value; if null, uses non-deterministic randomness
     */
    public WatermarkRandomizer(Long seed) {
        this.random = (seed != null) ? new Random(seed) : new Random();
    }

    /**
     * Generates a random position within the given bounds and margins.
     *
     * @param pageWidth Width of the page
     * @param pageHeight Height of the page
     * @param watermarkWidth Width of the watermark
     * @param watermarkHeight Height of the watermark
     * @param margin Minimum margin from page edges
     * @param boundsX Optional bounding box X coordinate (null for full page)
     * @param boundsY Optional bounding box Y coordinate (null for full page)
     * @param boundsWidth Optional bounding box width (null for full page)
     * @param boundsHeight Optional bounding box height (null for full page)
     * @return Array with [x, y] coordinates
     */
    public float[] generateRandomPosition(
            float pageWidth,
            float pageHeight,
            float watermarkWidth,
            float watermarkHeight,
            float margin,
            Float boundsX,
            Float boundsY,
            Float boundsWidth,
            Float boundsHeight) {

        // Determine effective bounds
        float effectiveX = (boundsX != null) ? boundsX : margin;
        float effectiveY = (boundsY != null) ? boundsY : margin;
        float effectiveWidth = (boundsWidth != null) ? boundsWidth : (pageWidth - 2 * margin);
        float effectiveHeight = (boundsHeight != null) ? boundsHeight : (pageHeight - 2 * margin);

        // Calculate available space
        float maxX = Math.max(effectiveX, effectiveX + effectiveWidth - watermarkWidth);
        float maxY = Math.max(effectiveY, effectiveY + effectiveHeight - watermarkHeight);
        float minX = effectiveX;
        float minY = effectiveY;

        // Generate random position within bounds
        float x = minX + random.nextFloat() * Math.max(0, maxX - minX);
        float y = minY + random.nextFloat() * Math.max(0, maxY - minY);

        return new float[] {x, y};
    }

    /**
     * Generates a list of fixed grid positions based on spacers.
     *
     * @param pageWidth Width of the page
     * @param pageHeight Height of the page
     * @param watermarkWidth Width of the watermark (includes spacing)
     * @param watermarkHeight Height of the watermark (includes spacing)
     * @param widthSpacer Horizontal spacing between watermarks
     * @param heightSpacer Vertical spacing between watermarks
     * @param count Maximum number of watermarks (0 for unlimited grid)
     * @return List of [x, y] coordinate arrays
     */
    public List<float[]> generateGridPositions(
            float pageWidth,
            float pageHeight,
            float watermarkWidth,
            float watermarkHeight,
            int widthSpacer,
            int heightSpacer,
            int count) {

        List<float[]> positions = new ArrayList<>();

        // Calculate how many rows and columns can fit on the page based on spacers
        int maxRows = (int) (pageHeight / (watermarkHeight + heightSpacer) + 1);
        int maxCols = (int) (pageWidth / (watermarkWidth + widthSpacer) + 1);

        if (count == 0) {
            // Unlimited grid: fill entire page using spacer-based grid
            for (int i = 0; i <= maxRows; i++) {
                for (int j = 0; j <= maxCols; j++) {
                    float x = j * (watermarkWidth + widthSpacer);
                    float y = i * (watermarkHeight + heightSpacer);
                    positions.add(new float[] {x, y});
                }
            }
        } else {
            // Limited count: distribute evenly across the page using spacer-based grid
            // Calculate optimal distribution
            int cols =
                    Math.min((int) Math.ceil(Math.sqrt(count * pageWidth / pageHeight)), maxCols);
            int rows = Math.min((int) Math.ceil((double) count / cols), maxRows);

            // Calculate step sizes to distribute watermarks evenly across available grid
            int colStep = Math.max(1, maxCols / cols);
            int rowStep = Math.max(1, maxRows / rows);

            int generated = 0;
            for (int i = 0; i < maxRows && generated < count; i += rowStep) {
                for (int j = 0; j < maxCols && generated < count; j += colStep) {
                    float x = j * (watermarkWidth + widthSpacer);
                    float y = i * (watermarkHeight + heightSpacer);
                    positions.add(new float[] {x, y});
                    generated++;
                }
            }
        }

        return positions;
    }

    /**
     * Generates a random rotation angle within the specified range.
     *
     * @param rotationMin Minimum rotation angle in degrees
     * @param rotationMax Maximum rotation angle in degrees
     * @return Random rotation angle in degrees
     */
    public float generateRandomRotation(float rotationMin, float rotationMax) {
        if (rotationMin == rotationMax) {
            return rotationMin;
        }
        return rotationMin + random.nextFloat() * (rotationMax - rotationMin);
    }

    /**
     * Determines whether to mirror based on probability.
     *
     * @param probability Probability of mirroring (0.0 to 1.0)
     * @return true if should mirror, false otherwise
     */
    public boolean shouldMirror(float probability) {
        return random.nextFloat() < probability;
    }

    /**
     * Selects a random font from the available font list.
     *
     * @param availableFonts List of available font names
     * @return Random font name from the list
     */
    public String selectRandomFont(List<String> availableFonts) {
        if (availableFonts == null || availableFonts.isEmpty()) {
            return "default";
        }
        return availableFonts.get(random.nextInt(availableFonts.size()));
    }

    /**
     * Generates a random font size within the specified range.
     *
     * @param fontSizeMin Minimum font size
     * @param fontSizeMax Maximum font size
     * @return Random font size
     */
    public float generateRandomFontSize(float fontSizeMin, float fontSizeMax) {
        if (fontSizeMin == fontSizeMax) {
            return fontSizeMin;
        }
        return fontSizeMin + random.nextFloat() * (fontSizeMax - fontSizeMin);
    }

    /**
     * Generates a random color from a predefined palette or full spectrum.
     *
     * @param usePalette If true, uses a predefined palette; otherwise generates random RGB
     * @return Random Color object
     */
    public Color generateRandomColor(boolean usePalette) {
        if (usePalette) {
            // Predefined palette of common colors
            Color[] palette = {
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
            return palette[random.nextInt(palette.length)];
        } else {
            // Generate random RGB color
            return new Color(random.nextInt(256), random.nextInt(256), random.nextInt(256));
        }
    }

    /**
     * Selects a random shading style from available options.
     *
     * @param availableShadings List of available shading styles
     * @return Random shading style
     */
    public String selectRandomShading(List<String> availableShadings) {
        if (availableShadings == null || availableShadings.isEmpty()) {
            return "none";
        }
        return availableShadings.get(random.nextInt(availableShadings.size()));
    }

    /**
     * Generates a random rotation for per-letter orientation within a safe range.
     *
     * @param maxRotation Maximum rotation angle in degrees (applied as +/- range)
     * @return Random rotation angle in degrees
     */
    public float generatePerLetterRotation(float maxRotation) {
        return -maxRotation + random.nextFloat() * (2 * maxRotation);
    }

    /**
     * Generates a random color from a limited palette.
     *
     * @param colorCount Number of colors to select from (1-12 from predefined palette)
     * @return Random Color object from the limited palette
     */
    public Color generateRandomColorFromPalette(int colorCount) {
        // Predefined palette of common colors
        Color[] fullPalette = {
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

        // Limit to requested count
        int actualCount = Math.min(colorCount, fullPalette.length);
        actualCount = Math.max(1, actualCount); // At least 1

        return fullPalette[random.nextInt(actualCount)];
    }

    /**
     * Selects a random font from a limited list of available fonts.
     *
     * @param fontCount Number of fonts to select from
     * @return Random font name
     */
    public String selectRandomFontFromCount(int fontCount) {
        // Predefined list of common PDF fonts
        String[] availableFonts = {
            "Helvetica",
            "Times-Roman",
            "Courier",
            "Helvetica-Bold",
            "Times-Bold",
            "Courier-Bold",
            "Helvetica-Oblique",
            "Times-Italic",
            "Courier-Oblique",
            "Symbol",
            "ZapfDingbats"
        };

        // Limit to requested count
        int actualCount = Math.min(fontCount, availableFonts.length);
        actualCount = Math.max(1, actualCount); // At least 1

        return availableFonts[random.nextInt(actualCount)];
    }

    /**
     * Generates a random rotation for per-letter orientation within specified range.
     *
     * @param minRotation Minimum rotation angle in degrees
     * @param maxRotation Maximum rotation angle in degrees
     * @return Random rotation angle in degrees
     */
    public float generatePerLetterRotationInRange(float minRotation, float maxRotation) {
        if (minRotation == maxRotation) {
            return minRotation;
        }
        return minRotation + random.nextFloat() * (maxRotation - minRotation);
    }

    /**
     * Gets the underlying Random instance for advanced use cases.
     *
     * @return The Random instance
     */
    public Random getRandom() {
        return random;
    }
}
