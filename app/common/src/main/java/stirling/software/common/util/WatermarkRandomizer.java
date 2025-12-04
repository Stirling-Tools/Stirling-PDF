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

    public static final Color[] PALETTE =
            new Color[] {
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
     * Generates a random position within the page.
     *
     * @param pageWidth Width of the page
     * @param pageHeight Height of the page
     * @param watermarkWidth Width of the watermark
     * @param watermarkHeight Height of the watermark
     * @return Array with [x, y] coordinates
     */
    public float[] generateRandomPosition(
            float pageWidth, float pageHeight, float watermarkWidth, float watermarkHeight) {

        // Calculate available space
        float maxX = Math.max(0, pageWidth - watermarkWidth);
        float maxY = Math.max(0, pageHeight - watermarkHeight);

        // Generate random position within page
        float x = random.nextFloat() * maxX;
        float y = random.nextFloat() * maxY;

        return new float[] {x, y};
    }

    /**
     * Generates multiple random positions with collision detection to ensure minimum spacing.
     *
     * <p>This method uses collision detection to ensure that each watermark maintains minimum
     * separation from all previously placed watermarks. If a valid position cannot be found after
     * multiple attempts, the method will still return the requested count but some positions may
     * not satisfy spacing constraints.
     *
     * @param pageWidth Width of the page
     * @param pageHeight Height of the page
     * @param watermarkWidth Width of the watermark
     * @param watermarkHeight Height of the watermark
     * @param widthSpacer Horizontal spacing between watermarks (minimum separation)
     * @param heightSpacer Vertical spacing between watermarks (minimum separation)
     * @param count Number of positions to generate
     * @return List of [x, y] coordinate arrays
     */
    public List<float[]> generateRandomPositions(
            float pageWidth,
            float pageHeight,
            float watermarkWidth,
            float watermarkHeight,
            int widthSpacer,
            int heightSpacer,
            int count) {

        List<float[]> positions = new ArrayList<>();
        float maxX = Math.max(0, pageWidth - watermarkWidth);
        float maxY = Math.max(0, pageHeight - watermarkHeight);

        // Prevent infinite loops with a maximum attempts limit
        int maxAttempts = count * 10;
        int attempts = 0;

        while (positions.size() < count && attempts < maxAttempts) {
            // Generate a random position
            float x = random.nextFloat() * maxX;
            float y = random.nextFloat() * maxY;

            // Check if position maintains minimum spacing from existing positions
            boolean validPosition = true;

            if (widthSpacer > 0 || heightSpacer > 0) {
                for (float[] existing : positions) {
                    float dx = Math.abs(x - existing[0]);
                    float dy = Math.abs(y - existing[1]);

                    // Check if the new position overlaps or violates spacing constraints
                    // Two watermarks violate spacing if their bounding boxes (including spacers)
                    // overlap
                    if (dx < (watermarkWidth + widthSpacer)
                            && dy < (watermarkHeight + heightSpacer)) {
                        validPosition = false;
                        break;
                    }
                }
            }

            if (validPosition) {
                positions.add(new float[] {x, y});
            }

            attempts++;
        }

        // If we couldn't generate enough positions with spacing constraints,
        // fill remaining positions without spacing constraints to meet the requested count
        while (positions.size() < count) {
            float x = random.nextFloat() * maxX;
            float y = random.nextFloat() * maxY;
            positions.add(new float[] {x, y});
        }

        return positions;
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

        // Calculate automatic margins to keep watermarks within page boundaries
        float maxX = Math.max(0, pageWidth - watermarkWidth);
        float maxY = Math.max(0, pageHeight - watermarkHeight);

        // Calculate how many rows and columns can fit within the page
        // Note: watermarkWidth/Height are the actual watermark dimensions (not including spacers)
        // We need to account for the spacing between watermarks when calculating grid capacity
        int maxRows = (int) Math.floor(maxY / (watermarkHeight + heightSpacer));
        int maxCols = (int) Math.floor(maxX / (watermarkWidth + widthSpacer));

        if (count == 0) {
            // Unlimited grid: fill page using spacer-based grid
            // Ensure watermarks stay within visible area
            for (int i = 0; i < maxRows; i++) {
                for (int j = 0; j < maxCols; j++) {
                    float x = j * (watermarkWidth + widthSpacer);
                    float y = i * (watermarkHeight + heightSpacer);
                    // Clamp to ensure within bounds
                    x = Math.min(x, maxX);
                    y = Math.min(y, maxY);
                    positions.add(new float[] {x, y});
                }
            }
        } else {
            // Limited count: distribute evenly across page
            // Calculate optimal distribution based on page aspect ratio
            // Don't use spacer-based limits; instead ensure positions fit within maxX/maxY
            int cols = (int) Math.ceil(Math.sqrt(count * pageWidth / pageHeight));
            int rows = (int) Math.ceil((double) count / cols);

            // Calculate spacing to distribute watermarks evenly within the visible area
            // Account for watermark dimensions to prevent overflow at edges
            float xSpacing = (cols > 1) ? maxX / (cols - 1) : 0;
            float ySpacing = (rows > 1) ? maxY / (rows - 1) : 0;

            int generated = 0;
            for (int i = 0; i < rows && generated < count; i++) {
                for (int j = 0; j < cols && generated < count; j++) {
                    float x = j * xSpacing;
                    float y = i * ySpacing;
                    // Clamp to ensure within bounds
                    x = Math.min(x, maxX);
                    y = Math.min(y, maxY);
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
            return PALETTE[random.nextInt(PALETTE.length)];
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
     * Generates a random color from a limited palette.
     *
     * @param colorCount Number of colors to select from (1-12 from predefined palette)
     * @return Random Color object from the limited palette
     */
    public Color generateRandomColorFromPalette(int colorCount) {
        // Limit to requested count
        int actualCount = Math.min(colorCount, PALETTE.length);
        actualCount = Math.max(1, actualCount); // At least 1

        return PALETTE[random.nextInt(actualCount)];
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
