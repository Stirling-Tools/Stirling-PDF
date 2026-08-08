package stirling.software.common.util;

import java.awt.Transparency;
import java.awt.color.ColorSpace;
import java.awt.geom.AffineTransform;
import java.awt.image.AffineTransformOp;
import java.awt.image.BufferedImage;
import java.awt.image.ColorModel;
import java.awt.image.ComponentColorModel;
import java.awt.image.DataBuffer;
import java.awt.image.DataBufferByte;
import java.awt.image.DataBufferInt;
import java.awt.image.Raster;
import java.awt.image.WritableRaster;
import java.io.IOException;
import java.io.InputStream;
import java.lang.foreign.Arena;
import java.nio.ByteBuffer;
import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifIFD0Directory;

import app.photofox.vipsffm.VBlob;
import app.photofox.vipsffm.VImage;
import app.photofox.vipsffm.enums.VipsBandFormat;
import app.photofox.vipsffm.enums.VipsInterpretation;
import app.photofox.vipsffm.enums.VipsOperationRelational;

public class ImageProcessingUtils {

    public static BufferedImage applyOrientation(BufferedImage image, double orientation) {
        if (orientation == 0 || orientation == 1) {
            return image;
        }

        int width = image.getWidth();
        int height = image.getHeight();

        AffineTransform tx = new AffineTransform();

        if (orientation == 3) {
            tx.translate(width, height);
            tx.rotate(Math.PI);
        } else if (orientation == 6) {
            tx.translate(height, 0);
            tx.rotate(Math.PI / 2);
            int temp = width;
            width = height;
            height = temp;
        } else if (orientation == 8) {
            tx.translate(0, width);
            tx.rotate(-Math.PI / 2);
            int temp = width;
            width = height;
            height = temp;
        } else if (orientation == 2) { // Flip Horizontal
            tx.scale(-1.0, 1.0);
            tx.translate(-width, 0);
        } else if (orientation == 4) { // Flip Vertical
            tx.scale(1.0, -1.0);
            tx.translate(0, -height);
        } else if (orientation == 5) { // Flip Vertical and Rotate 90 CW
            tx.rotate(Math.PI / 2);
            tx.scale(1.0, -1.0);
            int temp = width;
            width = height;
            height = temp;
        } else if (orientation == 7) { // Flip Horizontal and Rotate 90 CW
            tx.rotate(Math.PI / 2);
            tx.scale(-1.0, 1.0);
            tx.translate(-height, 0);
            int temp = width;
            width = height;
            height = temp;
        } else {
            // Log warning for unsupported orientation
            return image;
        }

        AffineTransformOp op = new AffineTransformOp(tx, AffineTransformOp.TYPE_BILINEAR);
        BufferedImage newImage = new BufferedImage(width, height, image.getType());
        return op.filter(image, newImage);
    }

    public static double extractImageOrientation(InputStream is) {
        try {
            Metadata metadata = ImageMetadataReader.readMetadata(is);
            ExifIFD0Directory directory = metadata.getFirstDirectoryOfType(ExifIFD0Directory.class);
            if (directory != null && directory.containsTag(ExifIFD0Directory.TAG_ORIENTATION)) {
                return directory.getInt(ExifIFD0Directory.TAG_ORIENTATION);
            }
        } catch (Exception e) {
            // Ignore and return default orientation
        }
        return 1;
    }

    public static BufferedImage loadImageWithExifOrientation(MultipartFile file)
            throws IOException {
        String filename = file.getOriginalFilename();
        byte[] fileBytes = file.getBytes();

        try (Arena arena = Arena.ofConfined()) {
            VImage vimg = RenderingUtils.loadAnyImage(arena, fileBytes);
            // Native auto-rotation based on EXIF orientation tag
            VImage rotated = vimg.autorot();
            BufferedImage image = vImageToBufferedImage(rotated);
            if (image == null) {
                throw ExceptionUtils.createImageReadException(filename);
            }
            return image;
        } catch (Exception e) {
            // Fallback to legacy AWT parser if native loader or rotation fails
            BufferedImage image;
            try (Arena arena = Arena.ofConfined()) {
                VImage vimg = RenderingUtils.loadAnyImage(arena, fileBytes);
                image = vImageToBufferedImage(vimg);
            }
            if (image == null) {
                throw ExceptionUtils.createImageReadException(filename);
            }
            try (InputStream inputStream = file.getInputStream()) {
                double orientation = extractImageOrientation(inputStream);
                return applyOrientation(image, orientation);
            }
        }
    }

    public static BufferedImage convertColorType(BufferedImage image, String colorType) {
        if (colorType == null || "fullcolor".equalsIgnoreCase(colorType)) {
            return image;
        }

        if (!"greyscale".equalsIgnoreCase(colorType) && !"blackwhite".equalsIgnoreCase(colorType)) {
            return image;
        }

        try (Arena arena = Arena.ofConfined()) {
            VImage vimg = RenderingUtils.bufferedImageToVImage(arena, image);
            if ("greyscale".equalsIgnoreCase(colorType)) {
                vimg = vimg.colourspace(VipsInterpretation.INTERPRETATION_B_W);
            } else if ("blackwhite".equalsIgnoreCase(colorType)) {
                vimg =
                        vimg.colourspace(VipsInterpretation.INTERPRETATION_B_W)
                                .relationalConst(
                                        VipsOperationRelational.OPERATION_RELATIONAL_MORE,
                                        List.of(128.0))
                                .cast(VipsBandFormat.FORMAT_UCHAR);
            }
            return vImageToBufferedImage(vimg);
        }
    }

    /** Bridges a VImage to a BufferedImage using raw pixel data. */
    public static BufferedImage vImageToBufferedImage(VImage vimg) {
        // If image is CMYK (4 bands) or has an unusual band count (e.g., 2 or >4),
        // convert to sRGB/RGBA to avoid color distortion or crashes.
        int bands = vimg.getInt("bands");
        int interpretation = vimg.getInt("interpretation");

        if (bands == 2
                || bands > 4
                || (bands == 4
                        && interpretation
                                == VipsInterpretation.INTERPRETATION_CMYK.getRawValue())) {
            vimg =
                    vimg.colourspace(
                            bands > 3
                                    ? VipsInterpretation.INTERPRETATION_sRGB
                                    : VipsInterpretation.INTERPRETATION_B_W);
            bands = vimg.getInt("bands");
        }

        int width = vimg.getWidth();
        int height = vimg.getHeight();
        VBlob raw = vimg.rawsaveBuffer();
        byte[] pixels = raw.getBytes();

        DataBufferByte buffer = new DataBufferByte(pixels, pixels.length);
        WritableRaster raster;
        ColorModel cm;

        if (bands == 1) {
            raster =
                    Raster.createInterleavedRaster(
                            buffer, width, height, width, 1, new int[] {0}, null);
            cm =
                    new ComponentColorModel(
                            ColorSpace.getInstance(ColorSpace.CS_GRAY),
                            false,
                            false,
                            Transparency.OPAQUE,
                            DataBuffer.TYPE_BYTE);
        } else if (bands == 3) {
            // libvips is RGB, BufferedImage expects RGB for TYPE_3BYTE_RGB
            raster =
                    Raster.createInterleavedRaster(
                            buffer, width, height, width * 3, 3, new int[] {0, 1, 2}, null);
            cm =
                    new ComponentColorModel(
                            ColorSpace.getInstance(ColorSpace.CS_sRGB),
                            false,
                            false,
                            Transparency.OPAQUE,
                            DataBuffer.TYPE_BYTE);
        } else if (bands == 4) {
            // libvips is RGBA
            raster =
                    Raster.createInterleavedRaster(
                            buffer, width, height, width * 4, 4, new int[] {0, 1, 2, 3}, null);
            cm =
                    new ComponentColorModel(
                            ColorSpace.getInstance(ColorSpace.CS_sRGB),
                            true,
                            false,
                            Transparency.TRANSLUCENT,
                            DataBuffer.TYPE_BYTE);
        } else {
            throw new RuntimeException("Unsupported band count from libvips: " + bands);
        }

        return new BufferedImage(cm, raster, false, null);
    }

    public static byte[] getImageData(BufferedImage image) {
        DataBuffer buffer = image.getRaster().getDataBuffer();
        if (buffer instanceof DataBufferByte) {
            return ((DataBufferByte) buffer).getData();
        } else if (buffer instanceof DataBufferInt) {
            int[] data = ((DataBufferInt) buffer).getData();
            ByteBuffer byteBuffer = ByteBuffer.allocate(data.length * 4);
            byteBuffer.asIntBuffer().put(data);
            return byteBuffer.array();
        } else {
            // Fallback for other types: convert to RGB byte array
            int width = image.getWidth();
            int height = image.getHeight();
            BufferedImage rgbImage = new BufferedImage(width, height, BufferedImage.TYPE_3BYTE_BGR);
            rgbImage.getGraphics().drawImage(image, 0, 0, null);
            return ((DataBufferByte) rgbImage.getRaster().getDataBuffer()).getData();
        }
    }
}
