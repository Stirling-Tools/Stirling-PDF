package stirling.software.SPDF.utils;

import java.awt.*;

import javax.swing.*;

public class UIScaling {
    private static final double BASE_RESOLUTION_WIDTH = 1920.0;
    private static final double BASE_RESOLUTION_HEIGHT = 1080.0;

    public static double getWidthScaleFactor() {
        Dimension screenSize = Toolkit.getDefaultToolkit().getScreenSize();
        return screenSize.getWidth() / BASE_RESOLUTION_WIDTH;
    }

    public static double getHeightScaleFactor() {
        Dimension screenSize = Toolkit.getDefaultToolkit().getScreenSize();
        return screenSize.getHeight() / BASE_RESOLUTION_HEIGHT;
    }

    public static int scaleWidth(int value) {
        return (int) Math.round(value * getWidthScaleFactor());
    }

    public static int scaleHeight(int value) {
        return (int) Math.round(value * getHeightScaleFactor());
    }

    public static Dimension scale(Dimension dim) {
        return new Dimension(scaleWidth(dim.width), scaleHeight(dim.height));
    }

    public static Insets scale(Insets insets) {
        return new Insets(
                scaleHeight(insets.top),
                scaleWidth(insets.left),
                scaleHeight(insets.bottom),
                scaleWidth(insets.right));
    }

    public static Font scaleFont(Font font) {
        // For fonts, we'll use the smaller scale factor to ensure readability
        double scaleFactor = Math.min(getWidthScaleFactor(), getHeightScaleFactor());
        return font.deriveFont((float) (font.getSize() * scaleFactor));
    }

    // Utility method for aspect ratio aware icon scaling
    public static Image scaleIcon(Image icon, int targetWidth, int targetHeight) {
        if (icon == null) return null;

        double widthScale = getWidthScaleFactor();
        double heightScale = getHeightScaleFactor();

        int scaledWidth = (int) Math.round(targetWidth * widthScale);
        int scaledHeight = (int) Math.round(targetHeight * heightScale);

        // Maintain aspect ratio for icons
        double aspectRatio = (double) icon.getWidth(null) / icon.getHeight(null);
        if (scaledWidth / scaledHeight > aspectRatio) {
            scaledWidth = (int) (scaledHeight * aspectRatio);
        } else {
            scaledHeight = (int) (scaledWidth / aspectRatio);
        }

        return icon.getScaledInstance(scaledWidth, scaledHeight, Image.SCALE_SMOOTH);
    }
}
