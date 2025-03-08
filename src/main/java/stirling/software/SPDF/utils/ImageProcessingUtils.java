package stirling.software.SPDF.utils;

import java.awt.geom.AffineTransform;
import java.awt.image.*;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;

import javax.imageio.ImageIO;

import org.springframework.web.multipart.MultipartFile;

import com.drew.imaging.ImageMetadataReader;
import com.drew.imaging.ImageProcessingException;
import com.drew.metadata.Metadata;
import com.drew.metadata.MetadataException;
import com.drew.metadata.exif.ExifSubIFDDirectory;

import lombok.extern.slf4j.Slf4j;

@Slf4j
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
        if (dataBuffer instanceof DataBufferByte dataBufferByte) {
            return dataBufferByte.getData();
        } else if (dataBuffer instanceof DataBufferInt dataBufferInt) {
            int[] intData = dataBufferInt.getData();
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

    public static double extractImageOrientation(InputStream is) throws IOException {
        try {
            Metadata metadata = ImageMetadataReader.readMetadata(is);
            ExifSubIFDDirectory directory =
                    metadata.getFirstDirectoryOfType(ExifSubIFDDirectory.class);
            if (directory == null) {
                return 0;
            }
            int orientationTag = directory.getInt(ExifSubIFDDirectory.TAG_ORIENTATION);
            switch (orientationTag) {
                case 1:
                    return 0;
                case 6:
                    return 90;
                case 3:
                    return 180;
                case 8:
                    return 270;
                default:
                    log.warn("Unknown orientation tag: {}", orientationTag);
                    return 0;
            }
        } catch (ImageProcessingException | MetadataException e) {
            return 0;
        }
    }

    public static BufferedImage applyOrientation(BufferedImage image, double orientation) {
        if (orientation == 0) {
            return image;
        }
        AffineTransform transform =
                AffineTransform.getRotateInstance(
                        Math.toRadians(orientation),
                        image.getWidth() / 2.0,
                        image.getHeight() / 2.0);
        AffineTransformOp op = new AffineTransformOp(transform, AffineTransformOp.TYPE_BILINEAR);
        return op.filter(image, null);
    }

    public static BufferedImage loadImageWithExifOrientation(MultipartFile file)
            throws IOException {
        BufferedImage image = ImageIO.read(file.getInputStream());
        double orientation = extractImageOrientation(file.getInputStream());
        return applyOrientation(image, orientation);
    }
}
