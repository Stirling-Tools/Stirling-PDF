package stirling.software.common.util;

import java.awt.image.BufferedImage;
import java.awt.image.DataBuffer;
import java.awt.image.DataBufferByte;
import java.awt.image.DataBufferInt;
import java.io.IOException;
import java.io.InputStream;
import java.lang.foreign.Arena;
import java.lang.foreign.MemorySegment;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import lombok.extern.slf4j.Slf4j;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfImageConverter;
import stirling.software.jpdfium.model.ImageFormat;
import stirling.software.jpdfium.transform.PageOps;

import app.photofox.vipsffm.VBlob;
import app.photofox.vipsffm.VImage;
import app.photofox.vipsffm.VSource;
import app.photofox.vipsffm.VipsOption;
import app.photofox.vipsffm.enums.VipsAccess;
import app.photofox.vipsffm.enums.VipsBandFormat;
import app.photofox.vipsffm.enums.VipsForeignHeifCompression;
import app.photofox.vipsffm.enums.VipsInterpretation;

@Slf4j
public class RenderingUtils {

    /**
     * Renders a PDF page to a VImage natively using libvips (PDFium) from a file path. This is the
     * most efficient way as it can use memory mapping.
     */
    public static VImage renderPageToVImage(Arena arena, Path pdfPath, int pageIndex, int dpi)
            throws IOException {
        try {
            // Optimized PDFium loading with sequential access hint for better speed/memory
            return VImage.pdfload(
                    arena,
                    pdfPath.toAbsolutePath().toString(),
                    VipsOption.Int("page", pageIndex),
                    VipsOption.Int("dpi", dpi),
                    VipsOption.Enum("access", VipsAccess.ACCESS_SEQUENTIAL),
                    VipsOption.Boolean("fail", true));
        } catch (Exception e) {
            log.debug(
                    "Native path-based pdfload failed, falling back to JPDFium: {}",
                    e.getMessage());
            byte[] pdfBytes = Files.readAllBytes(pdfPath);
            try (PdfDocument doc = PdfDocument.open(pdfBytes)) {
                BufferedImage bi = PageOps.renderPage(doc, pageIndex, dpi);
                return bufferedImageToVImage(arena, bi);
            }
        }
    }

    /** Bridges a BufferedImage to a VImage using ultra-fast zero-copy where possible. */
    public static VImage bufferedImageToVImage(Arena arena, BufferedImage bi) {
        int width = bi.getWidth();
        int height = bi.getHeight();
        int type = bi.getType();

        DataBuffer db = bi.getRaster().getDataBuffer();

        // 1. Optimized path for Byte-based images (Zero Heap Allocation)
        if (db instanceof DataBufferByte dbb) {
            byte[] pixels = dbb.getData();
            int bands =
                    (type == BufferedImage.TYPE_3BYTE_BGR)
                            ? 3
                            : (type == BufferedImage.TYPE_4BYTE_ABGR)
                                    ? 4
                                    : (type == BufferedImage.TYPE_BYTE_GRAY)
                                            ? 1
                                            : bi.getColorModel().getNumComponents();

            // Bridge Java heap to FFM off-heap memory segment.
            // This is a single copy to native memory, but zero heap allocation.
            MemorySegment segment =
                    arena.allocateFrom(java.lang.foreign.ValueLayout.JAVA_BYTE, pixels);

            VImage vimg =
                    VImage.newFromMemory(
                            arena,
                            segment,
                            width,
                            height,
                            bands,
                            VipsBandFormat.FORMAT_UCHAR.getRawValue());

            // Correct interpretation and band order for common types
            if (type == BufferedImage.TYPE_3BYTE_BGR) {
                // BGR -> RGB
                return bandReorder(arena, vimg, 2, 1, 0)
                        .copy(
                                VipsOption.Enum(
                                        "interpretation", VipsInterpretation.INTERPRETATION_sRGB));
            } else if (type == BufferedImage.TYPE_4BYTE_ABGR) {
                // ABGR [A, B, G, R] -> RGBA [R, G, B, A]
                return bandReorder(arena, vimg, 3, 2, 1, 0)
                        .copy(
                                VipsOption.Enum(
                                        "interpretation", VipsInterpretation.INTERPRETATION_sRGB));
            } else if (type == BufferedImage.TYPE_BYTE_GRAY) {
                return vimg.copy(
                        VipsOption.Enum("interpretation", VipsInterpretation.INTERPRETATION_B_W));
            }
            return vimg;
        }

        // 2. Optimized path for Int-based images (Zero Heap Allocation)
        if (db instanceof DataBufferInt dbi) {
            int[] pixels = dbi.getData();
            // On Little-Endian (standard), TYPE_INT_ARGB is stored as [B, G, R, A] in memory.
            MemorySegment segment =
                    arena.allocateFrom(java.lang.foreign.ValueLayout.JAVA_INT, pixels);

            VImage vimg =
                    VImage.newFromMemory(
                            arena,
                            segment,
                            width,
                            height,
                            4,
                            VipsBandFormat.FORMAT_UCHAR.getRawValue());

            if (type == BufferedImage.TYPE_INT_ARGB) {
                // BGRA -> RGBA
                return bandReorder(arena, vimg, 2, 1, 0, 3)
                        .copy(
                                VipsOption.Enum(
                                        "interpretation", VipsInterpretation.INTERPRETATION_sRGB));
            } else if (type == BufferedImage.TYPE_INT_RGB) {
                // BGRX -> RGB
                return bandReorder(arena, vimg.extractBand(0, VipsOption.Int("n", 3)), 2, 1, 0)
                        .copy(
                                VipsOption.Enum(
                                        "interpretation", VipsInterpretation.INTERPRETATION_sRGB));
            }
        }

        // 3. Fallback via getRGB into native memory
        int[] pixels = bi.getRGB(0, 0, width, height, null, 0, width);
        MemorySegment segment = arena.allocateFrom(java.lang.foreign.ValueLayout.JAVA_INT, pixels);
        return bandReorder(
                        arena,
                        VImage.newFromMemory(
                                arena,
                                segment,
                                width,
                                height,
                                4,
                                VipsBandFormat.FORMAT_UCHAR.getRawValue()),
                        2,
                        1,
                        0,
                        3)
                .copy(VipsOption.Enum("interpretation", VipsInterpretation.INTERPRETATION_sRGB));
    }

    /** Fast band reordering using extract and join. */
    private static VImage bandReorder(Arena arena, VImage vimg, int... order) {
        try {
            List<VImage> bands = new ArrayList<>();
            for (int i : order) {
                bands.add(vimg.extractBand(i));
            }
            return VImage.bandjoin(arena, bands);
        } catch (Exception e) {
            log.error("Failed to reorder bands", e);
            return vimg;
        }
    }

    /** Loads an image from an InputStream, utilizing native loaders and ImageMagick fallback. */
    public static VImage loadAnyImage(Arena arena, InputStream inputStream) throws IOException {
        try {
            VSource source = VSource.newFromInputStream(arena, inputStream);
            try {
                // Try high-fidelity loaders with sequential access
                return VImage.newFromSource(arena, source, "access=sequential,n=-1,fail=true");
            } catch (Exception e) {
                try {
                    // Retry without 'n' parameter if the format doesn't support it (e.g. JXL, PNG,
                    // JPG)
                    return VImage.newFromSource(arena, source, "access=sequential,fail=true");
                } catch (Exception ex) {
                    log.debug(
                            "Standard native loader failed, trying ImageMagick fallback: {}",
                            ex.getMessage());
                    try {
                        return VImage.magickloadSource(arena, source, VipsOption.Int("n", -1));
                    } catch (Exception ex2) {
                        try {
                            return VImage.magickloadSource(arena, source);
                        } catch (Exception ex3) {
                            throw ex3;
                        }
                    }
                }
            }
        } catch (Exception ex) {
            log.error("Failed to load image with any available native loader", ex);
            throw new IOException(
                    "Failed to load image with any available native loader: " + ex.getMessage(),
                    ex);
        }
    }

    /** Loads an image from bytes, utilizing native loaders and ImageMagick fallback. */
    public static VImage loadAnyImage(Arena arena, byte[] imageBytes) throws IOException {
        try {
            VBlob blob = VBlob.newFromBytes(arena, imageBytes);
            try {
                // Try standard libvips loaders with sequential access
                return VImage.newFromBytes(arena, imageBytes, "access=sequential,n=-1,fail=true");
            } catch (Exception e) {
                try {
                    // Retry without 'n' parameter if the format doesn't support it (e.g. JXL, PNG,
                    // JPG)
                    return VImage.newFromBytes(arena, imageBytes, "access=sequential,fail=true");
                } catch (Exception ex) {
                    log.debug(
                            "Standard libvips loader failed, trying ImageMagick fallback: {}",
                            ex.getMessage());
                    try {
                        return VImage.magickloadBuffer(arena, blob, VipsOption.Int("n", -1));
                    } catch (Exception ex2) {
                        try {
                            return VImage.magickloadBuffer(arena, blob);
                        } catch (Exception ex3) {
                            throw new IOException(
                                    "Failed to load image with any available native loader: "
                                            + ex3.getMessage(),
                                    ex3);
                        }
                    }
                }
            }
        } catch (Exception ex) {
            log.error("Failed to load image from bytes", ex);
            throw new IOException("Failed to load image: " + ex.getMessage(), ex);
        }
    }

    /**
     * Renders a PDF page to a byte array in the specified image format using JPDFium's native
     * encoder. Bypasses BufferedImage entirely for formats JPDFium supports (PNG, JPEG, WEBP, TIFF,
     * BMP). Falls back to PageOps render + libvips for unsupported formats.
     */
    public static byte[] renderPageToBytes(PdfDocument doc, int pageIndex, int dpi, String format)
            throws IOException {
        ImageFormat nativeFormat = toImageFormat(format);
        if (nativeFormat != null) {
            return PdfImageConverter.pageToBytes(doc, pageIndex, dpi, nativeFormat);
        }
        // Fallback for formats JPDFium can't encode (GIF, AVIF, JXL, etc.)
        BufferedImage bi = PageOps.renderPage(doc, pageIndex, dpi);
        return imageToBytes(bi, format);
    }

    /**
     * Converts a BufferedImage to a byte array using libvips (vips-ffm). Uses zero-copy memory
     * segment bridge for high performance.
     */
    public static byte[] imageToBytes(BufferedImage bi, String format) throws IOException {
        try (Arena arena = Arena.ofConfined()) {
            VImage image = bufferedImageToVImage(arena, bi);
            return vImageToBytes(image, format);
        } catch (Exception e) {
            throw new IOException("Failed to convert image to bytes", e);
        }
    }

    /** Writes a VImage to bytes in the specified format. */
    public static byte[] vImageToBytes(VImage image, String format, VipsOption... options) {
        VImage outputImage = image;
        String f = format.toLowerCase().replace(".", "");
        // JPEG doesn't support alpha — flatten to white background to avoid black
        if (("jpg".equals(f) || "jpeg".equals(f)) && outputImage.getInt("bands") == 4) {
            outputImage =
                    outputImage.flatten(
                            VipsOption.ArrayDouble("background", List.of(255.0, 255.0, 255.0)));
        }
        if ("webp".equals(f)) {
            int width = outputImage.getInt("width");
            int height = outputImage.getInt("height");
            if (width > 16383 || height > 16383) {
                double scale = 16383.0 / Math.max(width, height);
                outputImage = outputImage.resize(scale);
            }
        } else if ("jpg".equals(f) || "jpeg".equals(f)) {
            int width = outputImage.getInt("width");
            int height = outputImage.getInt("height");
            if (width > 65535 || height > 65535) {
                double scale = 65535.0 / Math.max(width, height);
                outputImage = outputImage.resize(scale);
            }
        } else if ("heic".equals(f) || "heif".equals(f) || "avif".equals(f)) {
            int width = outputImage.getInt("width");
            int height = outputImage.getInt("height");
            if (width > 16384 || height > 16384) {
                double scale = 16384.0 / Math.max(width, height);
                outputImage = outputImage.resize(scale);
            }
        }
        VBlob blob =
                switch (f) {
                    case "jpg", "jpeg" -> outputImage.jpegsaveBuffer(options);
                    case "png" -> outputImage.pngsaveBuffer(options);
                    case "webp" -> outputImage.webpsaveBuffer(options);
                    case "tif", "tiff" -> outputImage.tiffsaveBuffer(options);
                    case "gif" -> outputImage.gifsaveBuffer(options); // Native GIF saver
                    case "heic", "heif" -> outputImage.heifsaveBuffer(options);
                    case "avif" -> {
                        // AVIF is HEIF with AV1 compression
                        VipsOption[] newOptions = new VipsOption[options.length + 1];
                        System.arraycopy(options, 0, newOptions, 0, options.length);
                        newOptions[options.length] =
                                VipsOption.Enum(
                                        "compression",
                                        VipsForeignHeifCompression.FOREIGN_HEIF_COMPRESSION_AV1);
                        yield outputImage.heifsaveBuffer(newOptions);
                    }
                    case "jxl" -> outputImage.jxlsaveBuffer(options);
                    case "jp2", "jp2k" -> outputImage.jp2ksaveBuffer(options);
                    case "bmp" -> outputImage.magicksaveBuffer(options);
                    default -> outputImage.pngsaveBuffer(options);
                };
        return blob.getBytes();
    }

    public static boolean isLibVipsAvailable() {
        try {
            app.photofox.vipsffm.Vips.init();
            return true;
        } catch (Throwable e) {
            return false;
        }
    }

    /** Maps a format string to JPDFium's ImageFormat, or null if unsupported. */
    private static ImageFormat toImageFormat(String format) {
        return switch (format.toLowerCase().replace(".", "")) {
            case "png" -> ImageFormat.PNG;
            case "jpg", "jpeg" -> ImageFormat.JPEG;
            case "webp" -> ImageFormat.WEBP;
            case "tif", "tiff" -> ImageFormat.TIFF;
            case "bmp" -> ImageFormat.BMP;
            default -> null;
        };
    }

    /**
     * Generates an optimized thumbnail for a PDF page using JPDFium's native thumbnail API. Renders
     * at the minimum resolution needed for the target width.
     */
    public static byte[] thumbnail(PdfDocument doc, int pageIndex, int targetWidth, String format)
            throws IOException {
        ImageFormat nativeFormat = toImageFormat(format);
        if (nativeFormat == null) nativeFormat = ImageFormat.PNG;
        return PdfImageConverter.thumbnail(doc, pageIndex, targetWidth, nativeFormat);
    }
}
