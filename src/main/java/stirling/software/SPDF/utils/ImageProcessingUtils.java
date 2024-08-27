package stirling.software.SPDF.utils;

import java.awt.image.BufferedImage;
import java.awt.image.DataBuffer;
import java.awt.image.DataBufferByte;
import java.awt.image.DataBufferInt;
import java.nio.ByteBuffer;

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

    public static byte[] getImageData(BufferedImage image) {
        DataBuffer dataBuffer = image.getRaster().getDataBuffer();
        if (dataBuffer instanceof DataBufferByte) {
            return ((DataBufferByte) dataBuffer).getData();
        } else if (dataBuffer instanceof DataBufferInt) {
            int[] intData = ((DataBufferInt) dataBuffer).getData();
            ByteBuffer byteBuffer = ByteBuffer.allocate(intData.length * 4);
            byteBuffer.asIntBuffer().put(intData);
            return byteBuffer.array();
        } else {
            int width = image.getWidth();
            int height = image.getHeight();
            byte[] data = new byte[width * height * 3];
            int index = 0;
            for (int y = 0; y < height; y++) {
                for (int x = 0; x < width; x++) {
                    int rgb = image.getRGB(x, y);
                    data[index++] = (byte) ((rgb >> 16) & 0xFF); // Red
                    data[index++] = (byte) ((rgb >> 8) & 0xFF); // Green
                    data[index++] = (byte) (rgb & 0xFF); // Blue
                }
            }
            return data;
        }
    }
}
