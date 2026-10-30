package stirling.software.common.util;

import java.awt.geom.AffineTransform;
import java.awt.image.*;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.util.Iterator;
import java.util.Locale;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

import org.springframework.web.multipart.MultipartFile;

import com.drew.imaging.ImageMetadataReader;
import com.drew.imaging.ImageProcessingException;
import com.drew.metadata.Metadata;
import com.drew.metadata.MetadataException;
import com.drew.metadata.exif.ExifSubIFDDirectory;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class ImageProcessingUtils {

    // A tiny file can declare a huge canvas that only balloons into memory once rasterized
    // (a pixel bomb); ~10000x10000 is a generous ceiling for any real scan or photo.
    public static final long MAX_IMAGE_PIXELS = 100_000_000L;

    /** Rejects an upload whose declared pixels exceed the limit, read from the header alone. */
    public static void assertWithinPixelLimit(MultipartFile file) throws IOException {
        if (file == null) {
            return;
        }
        try (InputStream input = file.getInputStream()) {
            assertWithinPixelLimit(input);
        }
    }

    public static void assertWithinPixelLimit(byte[] imageBytes) throws IOException {
        if (imageBytes == null) {
            return;
        }
        assertWithinPixelLimit(new ByteArrayInputStream(imageBytes));
    }

    private static void assertWithinPixelLimit(InputStream input) throws IOException {
        try (ImageInputStream stream = ImageIO.createImageInputStream(input)) {
            if (stream == null) {
                return;
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) {
                // No decoder claims it; the normal read path raises its own error.
                return;
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(stream, true, true);
                assertReaderWithinPixelLimit(reader, 0);
            } finally {
                reader.dispose();
            }
        }
    }

    /** Header dimensions are widened to long before multiplying so the product cannot overflow. */
    static void assertReaderWithinPixelLimit(ImageReader reader, int imageIndex)
            throws IOException {
        long width = reader.getWidth(imageIndex);
        long height = reader.getHeight(imageIndex);
        if (width > 0 && height > 0 && width * height > MAX_IMAGE_PIXELS) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.imageTooLarge",
                    "Image dimensions {0}x{1} exceed the maximum of {2} pixels",
                    width,
                    height,
                    MAX_IMAGE_PIXELS);
        }
    }

    static BufferedImage convertColorType(BufferedImage sourceImage, String colorType) {
        return switch (colorType) {
            case "greyscale" -> {
                BufferedImage convertedImage =
                        new BufferedImage(
                                sourceImage.getWidth(),
                                sourceImage.getHeight(),
                                BufferedImage.TYPE_BYTE_GRAY);
                convertedImage.getGraphics().drawImage(sourceImage, 0, 0, null);
                yield convertedImage;
            }
            case "blackwhite" -> {
                BufferedImage convertedImage =
                        new BufferedImage(
                                sourceImage.getWidth(),
                                sourceImage.getHeight(),
                                BufferedImage.TYPE_BYTE_BINARY);
                convertedImage.getGraphics().drawImage(sourceImage, 0, 0, null);
                yield convertedImage;
            }
            default -> sourceImage;
        };
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
            int[] pixels = new int[width * height];

            image.getRGB(0, 0, width, height, pixels, 0, width);

            byte[] data = new byte[width * height * 3];
            int index = 0;
            for (int rgb : pixels) {
                data[index++] = (byte) ((rgb >> 16) & 0xFF); // Red
                data[index++] = (byte) ((rgb >> 8) & 0xFF); // Green
                data[index++] = (byte) (rgb & 0xFF); // Blue
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
            return switch (orientationTag) {
                case 1 -> 0;
                case 6 -> 90;
                case 3 -> 180;
                case 8 -> 270;
                default -> {
                    log.warn("Unknown orientation tag: {}", orientationTag);
                    yield 0;
                }
            };
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
        BufferedImage image = null;
        String filename = file.getOriginalFilename();

        assertWithinPixelLimit(file);

        if (filename != null && filename.toLowerCase(Locale.ROOT).endsWith(".psd")) {
            // For PSD files, try explicit ImageReader
            Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName("PSD");
            if (readers.hasNext()) {
                ImageReader reader = readers.next();
                try (ImageInputStream iis = ImageIO.createImageInputStream(file.getInputStream())) {
                    reader.setInput(iis);
                    image = reader.read(0);
                } finally {
                    reader.dispose();
                }
            }
            if (image == null) {
                throw new IOException(
                        "Unable to read image from file: "
                                + filename
                                + ". Supported PSD formats: RGB/CMYK/Gray 8-32 bit, RLE/ZIP"
                                + " compression");
            }
        } else {
            // For non-PSD files, use standard ImageIO
            image = ImageIO.read(file.getInputStream());
        }

        if (image == null) {
            throw ExceptionUtils.createImageReadException(filename);
        }

        double orientation = extractImageOrientation(file.getInputStream());
        return applyOrientation(image, orientation);
    }
}
