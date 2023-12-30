package stirling.software.SPDF.utils;

import java.awt.image.BufferedImage;

public class ImageProcessingUtils {

    static BufferedImage convertColorType(BufferedImage sourceImage, String colorType) {
        BufferedImage convertedImage;
        switch (colorType) {
            case "greyscale":
                convertedImage =
                        new BufferedImage(
                                sourceImage.getWidth(),
                                sourceImage.getHeight(),
                                BufferedImage.TYPE_BYTE_GRAY);
                convertedImage.getGraphics().drawImage(sourceImage, 0, 0, null);
                break;
            case "blackwhite":
                convertedImage =
                        new BufferedImage(
                                sourceImage.getWidth(),
                                sourceImage.getHeight(),
                                BufferedImage.TYPE_BYTE_BINARY);
                convertedImage.getGraphics().drawImage(sourceImage, 0, 0, null);
                break;
            default: // full color
                convertedImage = sourceImage;
                break;
        }
        return convertedImage;
    }
}
