package stirling.software.SPDF.controller.api.misc;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;
import java.util.List;
import java.util.Map.Entry;
import java.util.Objects;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.plugins.jpeg.JPEGImageWriteParam;
import javax.imageio.stream.ImageOutputStream;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImage;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.*;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.misc.OptimizePdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Slf4j
@Tag(name = "Misc", description = "Miscellaneous APIs")
@RequiredArgsConstructor
public class CompressController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final EndpointConfiguration endpointConfiguration;
    private final TempFileManager tempFileManager;

    private boolean isQpdfEnabled() {
        return endpointConfiguration.isGroupEnabled("qpdf");
    }

    private boolean isGhostscriptEnabled() {
        return endpointConfiguration.isGroupEnabled("Ghostscript");
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    private static class ImageReference {
        int pageNum; // Page number where the image appears
        COSName name; // The name used to reference this image
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    @AllArgsConstructor
    @NoArgsConstructor
    private static class NestedImageReference extends ImageReference {
        COSName formName; // Name of the form XObject containing the image
        COSName imageName; // Name of the image within the form
    }

    // Tracks compression stats for reporting
    private static class CompressionStats {
        int totalImages = 0;
        int nestedImages = 0;
        int uniqueImagesCount = 0;
        int compressedImages = 0;
        int skippedImages = 0;
        long totalOriginalBytes = 0;
        long totalCompressedBytes = 0;
    }

    // Replace all instances of original images with their compressed versions
    private static void replaceImages(
            PDDocument doc,
            Map<ImageIdentity, List<ImageReference>> uniqueImages,
            Map<ImageIdentity, PDImageXObject> compressedVersions)
            throws IOException {

        for (Entry<ImageIdentity, List<ImageReference>> entry : uniqueImages.entrySet()) {
            ImageIdentity imageIdentity = entry.getKey();
            List<ImageReference> references = entry.getValue();

            // Skip if no compressed version exists
            PDImageXObject compressedImage = compressedVersions.get(imageIdentity);
            if (compressedImage == null) continue;

            // Replace ALL instances with the compressed version
            for (ImageReference ref : references) {
                replaceImageReference(doc, ref, compressedImage);
            }
        }
    }

    // Find all images in the document, both direct and nested within forms
    private static Map<ImageIdentity, List<ImageReference>> findImages(PDDocument doc)
            throws IOException {
        Map<ImageIdentity, List<ImageReference>> uniqueImages = new HashMap<>();

        // Scan through all pages in the document
        for (int pageNum = 0; pageNum < doc.getNumberOfPages(); pageNum++) {
            PDPage page = doc.getPage(pageNum);
            PDResources res = page.getResources();
            if (res == null || res.getXObjectNames() == null) continue;

            // Process all XObjects on the page
            for (COSName name : res.getXObjectNames()) {
                PDXObject xobj = res.getXObject(name);

                // Direct image
                if (isImage(xobj)) {
                    addDirectImage(pageNum, name, (PDImageXObject) xobj, uniqueImages);
                    log.info(
                            "Found direct image '{}' on page {} - {}x{}",
                            name.getName(),
                            pageNum + 1,
                            ((PDImage) xobj).getWidth(),
                            ((PDImage) xobj).getHeight());
                }
                // Form XObject that may contain nested images
                else if (isForm(xobj)) {
                    checkFormForImages(pageNum, name, (PDFormXObject) xobj, uniqueImages);
                }
            }
        }

        return uniqueImages;
    }

    private static ImageReference addDirectImage(
            int pageNum,
            COSName name,
            PDImageXObject image,
            Map<ImageIdentity, List<ImageReference>> uniqueImages)
            throws IOException {
        ImageReference ref = new ImageReference();
        ref.pageNum = pageNum;
        ref.name = name;

        ImageIdentity identity = new ImageIdentity(image);
        uniqueImages.computeIfAbsent(identity, k -> new ArrayList<>()).add(ref);

        return ref;
    }

    // Look for images inside form XObjects
    private static void checkFormForImages(
            int pageNum,
            COSName formName,
            PDFormXObject formXObj,
            Map<ImageIdentity, List<ImageReference>> uniqueImages)
            throws IOException {
        PDResources formResources = formXObj.getResources();
        if (formResources == null || formResources.getXObjectNames() == null) {
            return;
        }

        log.info(
                "Checking form XObject '{}' on page {} for nested images",
                formName.getName(),
                pageNum + 1);

        // Process all XObjects within the form
        for (COSName nestedName : formResources.getXObjectNames()) {
            PDXObject nestedXobj = formResources.getXObject(nestedName);

            if (isImage(nestedXobj)) {
                PDImageXObject nestedImage = (PDImageXObject) nestedXobj;

                log.info(
                        "Found nested image '{}' in form '{}' on page {} - {}x{}",
                        nestedName.getName(),
                        formName.getName(),
                        pageNum + 1,
                        nestedImage.getWidth(),
                        nestedImage.getHeight());

                // Create specialized reference for the nested image
                NestedImageReference nestedRef = new NestedImageReference();
                nestedRef.pageNum = pageNum;
                nestedRef.formName = formName;
                nestedRef.imageName = nestedName;

                ImageIdentity identity = new ImageIdentity(nestedImage);
                uniqueImages.computeIfAbsent(identity, k -> new ArrayList<>()).add(nestedRef);
            }
        }
    }

    // Count total images and nested images
    private static void calculateImageStats(
            Map<ImageIdentity, List<ImageReference>> uniqueImages, CompressionStats stats) {
        for (List<ImageReference> references : uniqueImages.values()) {
            for (ImageReference ref : references) {
                stats.totalImages++;
                if (ref instanceof NestedImageReference) {
                    stats.nestedImages++;
                }
            }
        }
    }

    private static boolean isImage(PDXObject xobj) {
        return xobj instanceof PDImageXObject;
    }

    private static boolean isForm(PDXObject xobj) {
        return xobj instanceof PDFormXObject;
    }

    // Create compressed versions of all unique images
    private static Map<ImageIdentity, PDImageXObject> createCompressedImages(
            PDDocument doc,
            Map<ImageIdentity, List<ImageReference>> uniqueImages,
            double scaleFactor,
            float jpegQuality,
            boolean convertToGrayscale,
            CompressionStats stats)
            throws IOException {

        Map<ImageIdentity, PDImageXObject> compressedVersions = new HashMap<>();

        // Process each unique image exactly once
        for (Entry<ImageIdentity, List<ImageReference>> entry : uniqueImages.entrySet()) {
            ImageIdentity imageIdentity = entry.getKey();
            List<ImageReference> references = entry.getValue();

            if (references.isEmpty()) continue;

            // Get the first instance of this image
            PDImageXObject originalImage = getOriginalImage(doc, references.get(0));

            // Track original size
            int originalSize = (int) originalImage.getCOSObject().getLength();
            stats.totalOriginalBytes += originalSize;

            // Process this unique image
            PDImageXObject compressedImage =
                    compressImage(
                            doc,
                            originalImage,
                            originalSize,
                            scaleFactor,
                            jpegQuality,
                            convertToGrayscale);

            if (compressedImage != null) {
                // Store the compressed version in our map
                compressedVersions.put(imageIdentity, compressedImage);
                stats.compressedImages++;

                // Update compression stats
                int compressedSize = (int) compressedImage.getCOSObject().getLength();
                stats.totalCompressedBytes += (long) compressedSize * references.size();

                double reductionPercentage = 100.0 - ((compressedSize * 100.0) / originalSize);
                log.info(
                        "Image identity {}: Compressed from {} to {} (reduced by {}%)",
                        imageIdentity,
                        GeneralUtils.formatBytes(originalSize),
                        GeneralUtils.formatBytes(compressedSize),
                        String.format(Locale.ROOT, "%.1f", reductionPercentage));
            } else {
                log.info(
                        "Image identity {}: Not suitable for compression, skipping", imageIdentity);
                stats.totalCompressedBytes += (long) originalSize * references.size();
                stats.skippedImages++;
            }
        }

        return compressedVersions;
    }

    // Enhanced hash function to identify identical images with more data
    private static String generateImageHash(PDImageXObject image) {
        try {
            // Create a stream for the raw stream data
            try (InputStream stream = image.getCOSObject().createRawInputStream()) {
                // Read more data for better hash accuracy (16KB instead of 8KB)
                byte[] buffer = new byte[16384];
                int bytesRead = stream.read(buffer);
                if (bytesRead > 0) {
                    byte[] dataToHash =
                            bytesRead == buffer.length ? buffer : Arrays.copyOf(buffer, bytesRead);

                    // Also include image dimensions and color space in the hash
                    String enhancedData =
                            new String(dataToHash, StandardCharsets.UTF_8)
                                    + "_"
                                    + image.getWidth()
                                    + "_"
                                    + image.getHeight()
                                    + "_"
                                    + image.getColorSpace().getName()
                                    + "_"
                                    + image.getBitsPerComponent();

                    return bytesToHexString(generateMD5(enhancedData.getBytes()));
                }
                return "empty-stream";
            }
        } catch (Exception e) {
            ExceptionUtils.logException("image hash generation", e);
            return "fallback-" + System.identityHashCode(image);
        }
    }

    public TempFile compressImagesInPDF(
            Path pdfFile, double scaleFactor, float jpegQuality, boolean convertToGrayscale)
            throws Exception {
        TempFile newCompressedPDF = tempFileManager.createManagedTempFile(".pdf");
        long originalFileSize = Files.size(pdfFile);
        log.info(
                "Starting image compression with scale factor: {}, JPEG quality: {}, grayscale: {}"
                        + " on file size: {}",
                scaleFactor,
                jpegQuality,
                convertToGrayscale,
                GeneralUtils.formatBytes(originalFileSize));

        try (PDDocument doc = pdfDocumentFactory.load(pdfFile)) {
            // Find all unique images in the document
            Map<ImageIdentity, List<ImageReference>> uniqueImages = findImages(doc);

            // Get statistics
            CompressionStats stats = new CompressionStats();
            stats.uniqueImagesCount = uniqueImages.size();
            calculateImageStats(uniqueImages, stats);

            // Create compressed versions of unique images
            Map<ImageIdentity, PDImageXObject> compressedVersions =
                    createCompressedImages(
                            doc, uniqueImages, scaleFactor, jpegQuality, convertToGrayscale, stats);

            // Replace all instances with compressed versions
            replaceImages(doc, uniqueImages, compressedVersions);

            // Log compression statistics
            logCompressionStats(stats, originalFileSize);

            // Free memory before saving
            compressedVersions.clear();
            uniqueImages.clear();

            log.info("Saving compressed PDF to {}", newCompressedPDF.getPath());
            doc.save(newCompressedPDF.getAbsolutePath());

            // Log overall file size reduction
            long compressedFileSize = Files.size(newCompressedPDF.getPath());
            double overallReduction = 100.0 - ((compressedFileSize * 100.0) / originalFileSize);
            log.info(
                    "Overall PDF compression: {} → {} (reduced by {}%)",
                    GeneralUtils.formatBytes(originalFileSize),
                    GeneralUtils.formatBytes(compressedFileSize),
                    String.format(Locale.ROOT, "%.1f", overallReduction));
            return newCompressedPDF;
        } catch (Exception e) {
            newCompressedPDF.close();
            throw e;
        }
    }

    // Hash function to identify identical masks
    private static String generateMaskHash(PDImageXObject image) {
        try {
            // Try to get mask data from either getMask() or getSoftMask()
            PDImageXObject mask = image.getMask();
            if (mask == null) {
                mask = image.getSoftMask();
            }

            if (mask != null) {
                try (InputStream stream = mask.getCOSObject().createRawInputStream()) {
                    // Read up to first 4KB of mask data for the hash
                    byte[] buffer = new byte[4096];
                    int bytesRead = stream.read(buffer);
                    if (bytesRead > 0) {
                        byte[] dataToHash =
                                bytesRead == buffer.length
                                        ? buffer
                                        : Arrays.copyOf(buffer, bytesRead);
                        return bytesToHexString(generateMD5(dataToHash));
                    }
                    return "empty-mask";
                }
            }
            return "no-mask";
        } catch (Exception e) {
            ExceptionUtils.logException("mask hash generation", e);
            return "fallback-mask-" + System.identityHashCode(image);
        }
    }

    // Get original image from a reference
    private static PDImageXObject getOriginalImage(PDDocument doc, ImageReference ref)
            throws IOException {
        if (ref instanceof NestedImageReference nestedRef) {
            PDPage page = doc.getPage(nestedRef.pageNum);
            PDResources pageResources = page.getResources();

            // Get the form XObject
            PDFormXObject formXObj = (PDFormXObject) pageResources.getXObject(nestedRef.formName);

            // Get the nested image from the form's resources
            PDResources formResources = formXObj.getResources();
            return (PDImageXObject) formResources.getXObject(nestedRef.imageName);
        } else {
            // Get direct image from page resources
            PDPage page = doc.getPage(ref.pageNum);
            PDResources resources = page.getResources();
            return (PDImageXObject) resources.getXObject(ref.name);
        }
    }

    // Try to compress an image if it makes sense
    private static PDImageXObject compressImage(
            PDDocument doc,
            PDImageXObject originalImage,
            int originalSize,
            double scaleFactor,
            float jpegQuality,
            boolean convertToGrayscale)
            throws IOException {

        // Process and compress the image
        BufferedImage processedImage =
                processAndCompressImage(
                        originalImage, scaleFactor, jpegQuality, convertToGrayscale);

        if (processedImage == null) {
            return null;
        }

        // Convert to bytes for storage
        byte[] compressedData = convertToBytes(processedImage, jpegQuality);

        // Check if compression is beneficial
        if (compressedData.length < originalSize || convertToGrayscale) {
            // Create a compressed version
            return PDImageXObject.createFromByteArray(
                    doc, compressedData, originalImage.getCOSObject().toString());
        }

        return null;
    }

    private static String bytesToHexString(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format(Locale.ROOT, "%02x", b));
        }
        return sb.toString();
    }

    // Replace a specific image reference with a compressed version
    private static void replaceImageReference(
            PDDocument doc, ImageReference ref, PDImageXObject compressedImage) throws IOException {
        if (ref instanceof NestedImageReference nestedRef) {
            // Replace nested image within form XObject
            PDPage page = doc.getPage(nestedRef.pageNum);
            PDResources pageResources = page.getResources();

            // Get the form XObject
            PDFormXObject formXObj = (PDFormXObject) pageResources.getXObject(nestedRef.formName);

            // Replace the nested image in the form's resources
            PDResources formResources = formXObj.getResources();
            formResources.put(nestedRef.imageName, compressedImage);

            log.info(
                    "Replaced nested image '{}' in form '{}' on page {} with compressed version",
                    nestedRef.imageName.getName(),
                    nestedRef.formName.getName(),
                    nestedRef.pageNum + 1);
        } else {
            // Replace direct image in page resources
            PDPage page = doc.getPage(ref.pageNum);
            PDResources resources = page.getResources();
            resources.put(ref.name, compressedImage);

            log.info("Replaced direct image on page {} with compressed version", ref.pageNum + 1);
        }
    }

    // Log final stats about the compression
    private static void logCompressionStats(CompressionStats stats, long originalFileSize) {
        // Calculate image reduction percentage
        double overallImageReduction =
                stats.totalOriginalBytes > 0
                        ? 100.0 - ((stats.totalCompressedBytes * 100.0) / stats.totalOriginalBytes)
                        : 0;

        int duplicatedImages = stats.totalImages - stats.uniqueImagesCount;

        log.info(
                "Image compression summary - Total unique: {}, Compressed: {}, Skipped: {},"
                        + " Duplicates: {}, Nested: {}",
                stats.uniqueImagesCount,
                stats.compressedImages,
                stats.skippedImages,
                duplicatedImages,
                stats.nestedImages);
        log.info(
                "Total original image size: {}, compressed: {} (reduced by {}%)",
                GeneralUtils.formatBytes(stats.totalOriginalBytes),
                GeneralUtils.formatBytes(stats.totalCompressedBytes),
                String.format(Locale.ROOT, "%.1f", overallImageReduction));
    }

    private static BufferedImage convertToGrayscale(BufferedImage image) {
        BufferedImage grayImage =
                new BufferedImage(
                        image.getWidth(), image.getHeight(), BufferedImage.TYPE_BYTE_GRAY);

        Graphics2D g = grayImage.createGraphics();
        g.drawImage(image, 0, 0, null);
        g.dispose();

        return grayImage;
    }

    // Resize and optionally convert to grayscale
    private static BufferedImage processAndCompressImage(
            PDImageXObject image, double scaleFactor, float jpegQuality, boolean convertToGrayscale)
            throws IOException {
        BufferedImage bufferedImage = image.getImage();
        int originalWidth = bufferedImage.getWidth();
        int originalHeight = bufferedImage.getHeight();

        // Minimum dimensions to preserve reasonable quality
        int MIN_WIDTH = 400;
        int MIN_HEIGHT = 400;

        log.info("Original dimensions: {}x{}", originalWidth, originalHeight);

        // Skip if already small enough
        if ((originalWidth <= MIN_WIDTH || originalHeight <= MIN_HEIGHT) && !convertToGrayscale) {
            log.info("Skipping - below minimum dimensions threshold");
            return null;
        }

        // Convert to grayscale first if requested (before resizing for better quality)
        if (convertToGrayscale) {
            bufferedImage = convertToGrayscale(bufferedImage);
            log.info("Converted image to grayscale");
        }

        // Adjust scale factor for very large or very small images
        double adjustedScaleFactor = scaleFactor;
        if (originalWidth > 3000 || originalHeight > 3000) {
            // More aggressive for very large images
            adjustedScaleFactor = Math.min(scaleFactor, 0.75);
            log.info("Very large image, using more aggressive scale: {}", adjustedScaleFactor);
        } else if (originalWidth < 1000 || originalHeight < 1000) {
            // More conservative for smaller images
            adjustedScaleFactor = Math.max(scaleFactor, 0.9);
            log.info("Smaller image, using conservative scale: {}", adjustedScaleFactor);
        }

        int newWidth = (int) (originalWidth * adjustedScaleFactor);
        int newHeight = (int) (originalHeight * adjustedScaleFactor);

        // Ensure minimum dimensions
        newWidth = Math.max(newWidth, MIN_WIDTH);
        newHeight = Math.max(newHeight, MIN_HEIGHT);

        // Skip if change is negligible
        if ((double) newWidth / originalWidth > 0.95
                && (double) newHeight / originalHeight > 0.95
                && !convertToGrayscale) {
            log.info("Change too small, skipping compression");
            return null;
        }

        log.info(
                "Resizing to {}x{} ({}% of original)",
                newWidth, newHeight, Math.round((newWidth * 100.0) / originalWidth));

        BufferedImage scaledImage;
        if (convertToGrayscale) {
            // If already grayscale, maintain the grayscale format
            scaledImage = new BufferedImage(newWidth, newHeight, BufferedImage.TYPE_BYTE_GRAY);
        } else {
            // Otherwise use original color model
            scaledImage =
                    new BufferedImage(
                            newWidth,
                            newHeight,
                            bufferedImage.getColorModel().hasAlpha()
                                    ? BufferedImage.TYPE_INT_ARGB
                                    : BufferedImage.TYPE_INT_RGB);
        }
        Graphics2D g2d = scaledImage.createGraphics();
        g2d.setRenderingHint(
                RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2d.drawImage(bufferedImage, 0, 0, newWidth, newHeight, null);
        g2d.dispose();

        return scaledImage;
    }

    // Convert image to byte array with quality settings
    private static byte[] convertToBytes(BufferedImage scaledImage, float jpegQuality)
            throws IOException {
        String format = scaledImage.getColorModel().hasAlpha() ? "png" : "jpeg";
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();

        if ("jpeg".equals(format)) {
            // Get the best available JPEG writer
            Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpeg");
            ImageWriter writer = writers.next();

            JPEGImageWriteParam param = (JPEGImageWriteParam) writer.getDefaultWriteParam();

            // Set compression parameters
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(jpegQuality);
            param.setOptimizeHuffmanTables(true); // Better compression
            param.setProgressiveMode(ImageWriteParam.MODE_DEFAULT); // Progressive scanning

            // Write compressed image
            try (ImageOutputStream ios = ImageIO.createImageOutputStream(outputStream)) {
                writer.setOutput(ios);
                writer.write(null, new IIOImage(scaledImage, null, null), param);
            }
            writer.dispose();
        } else {
            ImageIO.write(scaledImage, format, outputStream);
        }

        return outputStream.toByteArray();
    }

    // Get image filter/compression type
    private static String getImageFilter(PDImageXObject image) {
        try {
            return image.getCOSObject().getDictionaryObject(COSName.FILTER).toString();
        } catch (Exception e) {
            return "unknown";
        }
    }

    // Get color profile information
    private static String getColorProfileInfo(PDImageXObject image) {
        try {
            // Try to get ICC profile information
            if (image.getColorSpace() != null) {
                return image.getColorSpace().getName()
                        + "_"
                        + image.getColorSpace().getNumberOfComponents();
            }
            return "no-profile";
        } catch (Exception e) {
            return "error-profile";
        }
    }

    // Determine image type from stream data
    private static String getImageType(PDImageXObject image) {
        try {
            String filter = getImageFilter(image);
            if (filter.contains("DCTDecode") || filter.contains("JPXDecode")) {
                return "JPEG";
            } else if (filter.contains("FlateDecode")) {
                return "PNG";
            } else if (filter.contains("CCITTFaxDecode")) {
                return "TIFF";
            } else if (filter.contains("JBIG2Decode")) {
                return "JBIG2";
            } else {
                return "RAW";
            }
        } catch (Exception e) {
            return "unknown";
        }
    }

    // Generate hash of decode parameters
    private static String generateDecodeParamsHash(PDImageXObject image) {
        try {
            // Get decode parameters that affect how the image is processed
            StringBuilder params = new StringBuilder();

            // Add filter information
            params.append(getImageFilter(image));

            // Add color space components
            params.append("_").append(image.getColorSpace().getNumberOfComponents());

            // Add bits per component
            params.append("_").append(image.getBitsPerComponent());

            // Add any decode array parameters
            if (image.getDecode() != null) {
                params.append("_").append(image.getDecode().toString());
            }

            return bytesToHexString(generateMD5(params.toString().getBytes()));
        } catch (Exception e) {
            return "fallback-decode-" + System.identityHashCode(image);
        }
    }

    private static byte[] generateMD5(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            return md.digest(data); // Get the MD5 hash of the image bytes
        } catch (NoSuchAlgorithmException e) {
            throw ExceptionUtils.createMd5AlgorithmException(e);
        }
    }

    private static class ImageIdentity {
        private final String pixelHash; // Hash of pixel data
        private final String colorSpace; // e.g., "DeviceRGB", "DeviceCMYK"
        private final int bitsPerComponent;
        private final boolean hasMask; // Has transparency
        private final String maskHash; // Hash of mask data if present
        private final int width; // Image width in pixels
        private final int height; // Image height in pixels
        private final String filter; // Image filter/compression type
        private final String colorProfile; // Color profile information
        private final long streamLength; // Original stream length
        private final String imageType; // Image type (JPEG, PNG, etc.)
        private final String decodeParams; // Decode parameters hash
        private final String metadataHash; // Hash of image metadata

        public ImageIdentity(PDImageXObject image) throws IOException {
            this.pixelHash = generateImageHash(image);
            this.colorSpace = image.getColorSpace().getName();
            this.bitsPerComponent = image.getBitsPerComponent();
            this.hasMask = image.getMask() != null || image.getSoftMask() != null;
            this.maskHash = hasMask ? generateMaskHash(image) : null;
            this.width = image.getWidth();
            this.height = image.getHeight();
            this.filter = getImageFilter(image);
            this.colorProfile = getColorProfileInfo(image);
            this.streamLength = image.getCOSObject().getLength();
            this.imageType = getImageType(image);
            this.decodeParams = generateDecodeParamsHash(image);
            this.metadataHash = this.generateMetadataHash(image);
        }

        // Generate hash of image metadata
        private String generateMetadataHash(PDImageXObject image) {
            try {
                StringBuilder metadata = new StringBuilder();

                // Add image dimensions
                metadata.append(image.getWidth()).append("x").append(image.getHeight());

                // Add color space info
                metadata.append("_").append(image.getColorSpace().getName());

                // Add bits per component
                metadata.append("_").append(image.getBitsPerComponent());

                // Add stream length
                metadata.append("_").append(image.getCOSObject().getLength());

                // Add mask information
                if (image.getMask() != null) {
                    metadata.append("_mask");
                }
                if (image.getSoftMask() != null) {
                    metadata.append("_softmask");
                }

                return bytesToHexString(generateMD5(metadata.toString().getBytes()));
            } catch (Exception e) {
                return "fallback-meta-" + System.identityHashCode(image);
            }
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof ImageIdentity that)) return false;
            return bitsPerComponent == that.bitsPerComponent
                    && hasMask == that.hasMask
                    && width == that.width
                    && height == that.height
                    && streamLength == that.streamLength
                    && Objects.equals(pixelHash, that.pixelHash)
                    && Objects.equals(colorSpace, that.colorSpace)
                    && Objects.equals(maskHash, that.maskHash)
                    && Objects.equals(filter, that.filter)
                    && Objects.equals(colorProfile, that.colorProfile)
                    && Objects.equals(imageType, that.imageType)
                    && Objects.equals(decodeParams, that.decodeParams)
                    && Objects.equals(metadataHash, that.metadataHash);
        }

        @Override
        public int hashCode() {
            return Objects.hash(
                    pixelHash,
                    colorSpace,
                    bitsPerComponent,
                    hasMask,
                    maskHash,
                    width,
                    height,
                    filter,
                    colorProfile,
                    streamLength,
                    imageType,
                    decodeParams,
                    metadataHash);
        }

        @Override
        public String toString() {
            return String.format(
                    Locale.ROOT,
                    "%s_%s_%d_%dx%d_%s_%s_%d_%s_%s_%s",
                    pixelHash.substring(0, Math.min(8, pixelHash.length())),
                    colorSpace,
                    bitsPerComponent,
                    width,
                    height,
                    filter,
                    imageType,
                    streamLength,
                    hasMask ? "masked" : "nomask",
                    decodeParams.substring(0, Math.min(4, decodeParams.length())),
                    metadataHash.substring(0, Math.min(4, metadataHash.length())));
        }
    }

    // Scale factors for different optimization levels (lower => smaller)
    private static double getScaleFactorForLevel(int optimizeLevel) {
        return switch (optimizeLevel) {
            case 1 -> 0.98; // negligible resizing
            case 2 -> 0.95;
            case 3 -> 0.88;
            case 4 -> 0.78;
            case 5 -> 0.68;
            case 6 -> 0.58;
            case 7 -> 0.48;
            case 8 -> 0.38;
            case 9 -> 0.28;
            default -> 1.0;
        };
    }

    // JPEG quality for different optimization levels (lower => smaller)
    private static float getJpegQualityForLevel(int optimizeLevel) {
        return switch (optimizeLevel) {
            case 1 -> 0.92f; // very light
            case 2 -> 0.88f;
            case 3 -> 0.85f;
            case 4 -> 0.80f;
            case 5 -> 0.72f;
            case 6 -> 0.65f;
            case 7 -> 0.55f;
            case 8 -> 0.45f;
            case 9 -> 0.35f; // aggressive
            default -> 0.75f;
        };
    }

    // Pick optimization level based on target size
    private static int determineOptimizeLevel(double sizeReductionRatio) {
        if (sizeReductionRatio > 0.9) return 1;
        if (sizeReductionRatio > 0.8) return 2;
        if (sizeReductionRatio > 0.7) return 3;
        if (sizeReductionRatio > 0.6) return 4;
        if (sizeReductionRatio > 0.3) return 5;
        if (sizeReductionRatio > 0.2) return 6;
        if (sizeReductionRatio > 0.15) return 7;
        if (sizeReductionRatio > 0.1) return 8;
        return 9;
    }

    // Increment optimization level if we need more compression
    private static int incrementOptimizeLevel(int currentLevel, long currentSize, long targetSize) {
        double currentRatio = currentSize / (double) targetSize;
        log.info("Current compression ratio: {}", String.format(Locale.ROOT, "%.2f", currentRatio));

        if (currentRatio > 2.0) {
            return Math.min(9, currentLevel + 3);
        } else if (currentRatio > 1.5) {
            return Math.min(9, currentLevel + 2);
        }
        return Math.min(9, currentLevel + 1);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/compress-pdf")
    @Operation(
            summary = "Optimize PDF file",
            description =
                    "This endpoint accepts a PDF file and optimizes it based on the provided"
                            + " parameters. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> optimizePdf(@ModelAttribute OptimizePdfRequest request)
            throws Exception {
        MultipartFile inputFile = request.getFileInput();
        Integer optimizeLevel = request.getOptimizeLevel();
        String expectedOutputSizeString = request.getExpectedOutputSize();
        Boolean convertToGrayscale = request.getGrayscale();
        if (expectedOutputSizeString == null && optimizeLevel == null) {
            throw new Exception("Both expected output size and optimize level are not specified");
        }

        Long expectedOutputSize = 0L;
        boolean autoMode = false;
        if (expectedOutputSizeString != null && expectedOutputSizeString.length() > 1) {
            expectedOutputSize = GeneralUtils.convertSizeToBytes(expectedOutputSizeString);
            autoMode = true;
        }

        List<TempFile> tempFiles = new ArrayList<>();

        // Create initial input file
        TempFile originalTempFile = tempFileManager.createManagedTempFile(".pdf");
        tempFiles.add(originalTempFile);
        Path originalFile = originalTempFile.getPath();
        inputFile.transferTo(originalTempFile.getFile());
        long inputFileSize = Files.size(originalFile);

        TempFile currentTempFile = tempFileManager.createManagedTempFile(".pdf");
        tempFiles.add(currentTempFile);
        Path currentFile = currentTempFile.getPath();
        Files.copy(originalFile, currentFile, StandardCopyOption.REPLACE_EXISTING);

        try {
            if (autoMode) {
                double sizeReductionRatio = expectedOutputSize / (double) inputFileSize;
                optimizeLevel = determineOptimizeLevel(sizeReductionRatio);
            }

            boolean sizeMet = false;
            boolean imageCompressionApplied = false;
            boolean externalCompressionApplied = false;

            while (!sizeMet && optimizeLevel <= 9) {
                // Apply external compression first
                boolean ghostscriptSuccess = false;

                if (isGhostscriptEnabled() && optimizeLevel >= 6) {
                    try {
                        applyGhostscriptCompression(request, optimizeLevel, currentFile);
                        log.info("Ghostscript compression applied successfully");
                        ghostscriptSuccess = true;
                    } catch (IOException e) {
                        log.warn("Ghostscript compression failed, continuing with other methods");
                    }
                }

                // Always apply QPDF when enabled to recompress/optimize structure
                if (isQpdfEnabled()) {
                    try {
                        applyQpdfCompression(request, optimizeLevel, currentFile);
                        log.info("QPDF compression applied successfully");
                    } catch (IOException e) {
                        log.warn("QPDF compression failed");
                    }
                } else if (!ghostscriptSuccess) {
                    log.info(
                            "No external compression tools available, using image compression"
                                    + " only");
                }

                externalCompressionApplied = true;

                // Skip image compression if Ghostscript succeeded
                if (ghostscriptSuccess) {
                    imageCompressionApplied = true;
                }

                // Apply image compression for levels 4+ only if Ghostscript didn't run
                if ((optimizeLevel >= 4 || Boolean.TRUE.equals(convertToGrayscale))
                        && !imageCompressionApplied) {
                    // Use different scale factors based on level
                    double scaleFactor = getScaleFactorForLevel(optimizeLevel);
                    // Use JPEG quality settings based on optimization level
                    float jpegQuality = getJpegQualityForLevel(optimizeLevel);

                    log.info(
                            "Applying image compression with scale factor: {} and JPEG quality: {}",
                            scaleFactor,
                            jpegQuality);
                    TempFile compressedImageFile =
                            compressImagesInPDF(
                                    currentFile,
                                    scaleFactor,
                                    jpegQuality,
                                    Boolean.TRUE.equals(convertToGrayscale));

                    tempFiles.add(compressedImageFile);
                    currentFile = compressedImageFile.getPath();
                    imageCompressionApplied = true;
                }

                // Check if target size reached or not in auto mode
                long outputFileSize = Files.size(currentFile);
                if (outputFileSize <= expectedOutputSize || !autoMode) {
                    sizeMet = true;
                } else {
                    int newOptimizeLevel =
                            incrementOptimizeLevel(
                                    optimizeLevel, outputFileSize, expectedOutputSize);

                    // Check if we can't increase the level further
                    if (newOptimizeLevel == optimizeLevel) {
                        log.info("Maximum optimization level reached without meeting target size.");
                        sizeMet = true;
                    } else {
                        // Reset flags for next iteration with higher optimization level
                        imageCompressionApplied = false;
                        externalCompressionApplied = false;
                        optimizeLevel = newOptimizeLevel;
                    }
                }
            }

            // Use original if optimized file is somehow larger or currentFile is invalid
            if (!Files.exists(currentFile)) {
                log.warn("Optimized file missing or invalid. Using the original file instead.");
                currentFile = originalFile;
            }
            long finalFileSize = Files.size(currentFile);
            if (finalFileSize >= inputFileSize) {
                log.warn(
                        "Optimized file is larger than the original. Using the original file"
                                + " instead.");
                currentFile = originalFile;
            }

            String outputFilename =
                    GeneralUtils.generateFilename(
                            inputFile.getOriginalFilename(), "_Optimized.pdf");

            return WebResponseUtils.pdfDocToWebResponse(
                    pdfDocumentFactory.load(currentFile.toFile()), outputFilename);

        } finally {
            // Clean up all temporary files
            for (TempFile tempFile : tempFiles) {
                try {
                    tempFile.close();
                } catch (Exception e) {
                    log.warn("Failed to delete temporary file: {}", tempFile, e);
                }
            }
        }
    }

    // Run Ghostscript compression
    private void applyGhostscriptCompression(
            OptimizePdfRequest request, int optimizeLevel, Path currentFile) throws IOException {

        long preGsSize = Files.size(currentFile);
        log.info("Pre-Ghostscript file size: {}", GeneralUtils.formatBytes(preGsSize));

        try (TempFile gsOutputFile = tempFileManager.createManagedTempFile(".pdf")) {
            Path gsOutputPath = gsOutputFile.getPath();

            // Build Ghostscript command based on optimization level
            List<String> command = new ArrayList<>();
            command.add("gs");
            command.add("-sDEVICE=pdfwrite");
            command.add("-dCompatibilityLevel=1.5");
            command.add("-dNOPAUSE");
            command.add("-dQUIET");
            command.add("-dBATCH");

            // General compression enhancements
            command.add("-dDetectDuplicateImages=true");
            command.add("-dDownsampleColorImages=true");
            command.add("-dCompressFonts=true");
            command.add("-dSubsetFonts=true");

            // Map optimization levels to Ghostscript settings
            switch (optimizeLevel) {
                case 1:
                    command.add("-dPDFSETTINGS=/prepress");
                    break;
                case 2:
                    command.add("-dPDFSETTINGS=/printer");
                    break;
                case 3:
                    command.add("-dPDFSETTINGS=/ebook");
                    break;
                case 4:
                case 5:
                    command.add("-dPDFSETTINGS=/screen");
                    break;
                case 6:
                case 7:
                    command.add("-dPDFSETTINGS=/screen");
                    command.add("-dColorImageResolution=150");
                    command.add("-dGrayImageResolution=150");
                    command.add("-dMonoImageResolution=300");
                    break;
                case 8:
                case 9:
                    command.add("-dPDFSETTINGS=/screen");
                    // Use stronger downsampling at the highest level
                    if (optimizeLevel == 9) {
                        command.add("-dColorImageResolution=72");
                        command.add("-dGrayImageResolution=72");
                        command.add("-dMonoImageResolution=150");
                    } else {
                        command.add("-dColorImageResolution=100");
                        command.add("-dGrayImageResolution=100");
                        command.add("-dMonoImageResolution=200");
                    }
                    break;
                case 10:
                    command.add("-dPDFSETTINGS=/screen");
                    command.add("-dColorImageResolution=72");
                    command.add("-dGrayImageResolution=72");
                    command.add("-dMonoImageResolution=150");
                    break;
                default:
                    command.add("-dPDFSETTINGS=/screen");
                    break;
            }

            // If grayscale conversion requested, enforce grayscale color processing in Ghostscript
            boolean grayscaleRequested = Boolean.TRUE.equals(request.getGrayscale());
            if (grayscaleRequested) {
                command.add("-dColorConversionStrategy=/Gray");
                command.add("-dProcessColorModel=/DeviceGray");
            }

            // Optional conversion: CMYK -> RGB for color output only (avoid conflict with
            // grayscale)
            if (optimizeLevel >= 7 && !grayscaleRequested) {
                command.add("-dConvertCMYKImagesToRGB=true");
            }

            command.add("-sOutputFile=" + gsOutputPath.toString());
            command.add(currentFile.toString());

            ProcessExecutorResult returnCode;
            try {
                returnCode =
                        ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                                .runCommandWithOutputHandling(command);

                if (returnCode.getRc() == 0) {
                    // Update current file to the Ghostscript output
                    Files.copy(gsOutputPath, currentFile, StandardCopyOption.REPLACE_EXISTING);

                    long postGsSize = Files.size(currentFile);
                    double gsReduction = 100.0 - ((postGsSize * 100.0) / preGsSize);
                    log.info(
                            "Post-Ghostscript file size: {} (reduced by {}%)",
                            GeneralUtils.formatBytes(postGsSize),
                            String.format(Locale.ROOT, "%.1f", gsReduction));
                } else {
                    log.warn(
                            "Ghostscript compression failed with return code: {}",
                            returnCode.getRc());
                    throw new IOException("Ghostscript compression failed");
                }

                // replace the existing catch with these two catches
            } catch (InterruptedException e) {
                // restore interrupted status and propagate as an IOException
                Thread.currentThread().interrupt();
                InterruptedIOException ie =
                        new InterruptedIOException("Ghostscript command interrupted");
                ie.initCause(e);
                throw ie;
            } catch (Exception e) {
                log.warn("Ghostscript compression failed, will fallback to other methods", e);
                throw new IOException("Ghostscript compression failed", e);
            }
        }
    }

    // Run QPDF compression
    private void applyQpdfCompression(
            OptimizePdfRequest request, int optimizeLevel, Path currentFile) throws IOException {

        long preQpdfSize = Files.size(currentFile);
        log.info("Pre-QPDF file size: {}", GeneralUtils.formatBytes(preQpdfSize));

        // Map optimization levels to QPDF compression levels
        int qpdfCompressionLevel =
                switch (optimizeLevel) {
                    case 1 -> 3; // faster, lighter
                    case 2 -> 5;
                    case 3, 4, 5 -> 7;
                    default -> 9; // 6-9 use max
                };

        try (TempFile qpdfOutputFile = tempFileManager.createManagedTempFile(".pdf")) {
            Path qpdfOutputPath = qpdfOutputFile.getPath();

            // Build QPDF command
            List<String> command = new ArrayList<>();
            command.add("qpdf");
            if (Boolean.TRUE.equals(request.getNormalize())) {
                command.add("--normalize-content=y");
            }
            if (Boolean.TRUE.equals(request.getLinearize())) {
                command.add("--linearize");
            }
            // Decode/encode settings for maximal recompression
            command.add("--decode-level=generalized");
            command.add("--recompress-flate");
            command.add("--compression-level=" + qpdfCompressionLevel);
            command.add("--compress-streams=y");
            command.add("--stream-data=compress");
            // Preserve unreferenced only at lower levels for safety; skip at highest levels for
            // size
            if (optimizeLevel <= 3) {
                command.add("--preserve-unreferenced");
            }
            // Optional image optimization in qpdf (no resampling; lossy JPEG when beneficial)
            // Enable qpdf image optimization at medium/high levels
            if (optimizeLevel >= 5) {
                command.add("--optimize-images");
                // Map optimize level to JPEG quality (lower number => smaller size)
                Integer jpegQuality =
                        switch (optimizeLevel) {
                            case 5 -> 78;
                            case 6 -> 68;
                            case 7 -> 58;
                            case 8 -> 46;
                            default -> 34; // 9+
                        };
                command.add("--jpeg-quality=" + jpegQuality);
            }
            command.add("--object-streams=generate");
            command.add(currentFile.toString());
            command.add(qpdfOutputPath.toString());

            ProcessExecutorResult returnCode = null;
            try {
                // On high levels, prefer zopfli if platform supports env wrapper
                if (optimizeLevel >= 8) {
                    String os = System.getProperty("os.name").toLowerCase(Locale.ROOT);
                    if (!os.contains("win")) {
                        // Prepend env QPDF_ZOPFLI=silent for Unix-like systems
                        List<String> zopfliCommand = new ArrayList<>();
                        zopfliCommand.add("env");
                        zopfliCommand.add("QPDF_ZOPFLI=silent");
                        zopfliCommand.addAll(command);
                        command = zopfliCommand;
                    }
                }
                returnCode =
                        ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF)
                                .runCommandWithOutputHandling(command, null);

                // Update current file to the QPDF output
                Files.copy(qpdfOutputPath, currentFile, StandardCopyOption.REPLACE_EXISTING);

                long postQpdfSize = Files.size(currentFile);
                double qpdfReduction = 100.0 - ((postQpdfSize * 100.0) / preQpdfSize);
                log.info(
                        "Post-QPDF file size: {} (reduced by {}%)",
                        GeneralUtils.formatBytes(postQpdfSize),
                        String.format(Locale.ROOT, "%.1f", qpdfReduction));

            } catch (IOException e) {
                if (returnCode != null && returnCode.getRc() != 3) {
                    throw new IOException("QPDF command failed", e);
                }
                // If QPDF fails, keep using the current file
                log.warn("QPDF compression failed, continuing with current file", e);
            } catch (InterruptedException e) {
                // restore interrupted status and propagate as an IOException
                Thread.currentThread().interrupt();
                InterruptedIOException ie = new InterruptedIOException("QPDF command interrupted");
                ie.initCause(e);
                throw ie;
            }
        }
    }
}
