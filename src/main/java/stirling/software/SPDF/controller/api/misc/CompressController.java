package stirling.software.SPDF.controller.api.misc;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;

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
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.misc.OptimizePdfRequest;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Slf4j
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class CompressController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final boolean qpdfEnabled;

    public CompressController(
            CustomPDFDocumentFactory pdfDocumentFactory,
            EndpointConfiguration endpointConfiguration) {
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.qpdfEnabled = endpointConfiguration.isGroupEnabled("qpdf");
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

    public Path compressImagesInPDF(
            Path pdfFile, double scaleFactor, float jpegQuality, boolean convertToGrayscale)
            throws Exception {
        Path newCompressedPDF = Files.createTempFile("compressedPDF", ".pdf");
        long originalFileSize = Files.size(pdfFile);
        log.info(
                "Starting image compression with scale factor: {}, JPEG quality: {}, grayscale: {} on file size: {}",
                scaleFactor,
                jpegQuality,
                convertToGrayscale,
                GeneralUtils.formatBytes(originalFileSize));

        try (PDDocument doc = pdfDocumentFactory.load(pdfFile)) {
            // Find all unique images in the document
            Map<String, List<ImageReference>> uniqueImages = findImages(doc);

            // Get statistics
            CompressionStats stats = new CompressionStats();
            stats.uniqueImagesCount = uniqueImages.size();
            calculateImageStats(uniqueImages, stats);

            // Create compressed versions of unique images
            Map<String, PDImageXObject> compressedVersions =
                    createCompressedImages(
                            doc, uniqueImages, scaleFactor, jpegQuality, convertToGrayscale, stats);

            // Replace all instances with compressed versions
            replaceImages(doc, uniqueImages, compressedVersions, stats);

            // Log compression statistics
            logCompressionStats(stats, originalFileSize);

            // Free memory before saving
            compressedVersions.clear();
            uniqueImages.clear();

            log.info("Saving compressed PDF to {}", newCompressedPDF.toString());
            doc.save(newCompressedPDF.toString());

            // Log overall file size reduction
            long compressedFileSize = Files.size(newCompressedPDF);
            double overallReduction = 100.0 - ((compressedFileSize * 100.0) / originalFileSize);
            log.info(
                    "Overall PDF compression: {} → {} (reduced by {}%)",
                    GeneralUtils.formatBytes(originalFileSize),
                    GeneralUtils.formatBytes(compressedFileSize),
                    String.format("%.1f", overallReduction));
            return newCompressedPDF;
        }
    }

    // Find all images in the document, both direct and nested within forms
    private Map<String, List<ImageReference>> findImages(PDDocument doc) throws IOException {
        Map<String, List<ImageReference>> uniqueImages = new HashMap<>();

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
                            ((PDImageXObject) xobj).getWidth(),
                            ((PDImageXObject) xobj).getHeight());
                }
                // Form XObject that may contain nested images
                else if (isForm(xobj)) {
                    checkFormForImages(pageNum, name, (PDFormXObject) xobj, uniqueImages);
                }
            }
        }

        return uniqueImages;
    }

    private boolean isImage(PDXObject xobj) {
        return xobj instanceof PDImageXObject;
    }

    private boolean isForm(PDXObject xobj) {
        return xobj instanceof PDFormXObject;
    }

    private ImageReference addDirectImage(
            int pageNum,
            COSName name,
            PDImageXObject image,
            Map<String, List<ImageReference>> uniqueImages)
            throws IOException {
        ImageReference ref = new ImageReference();
        ref.pageNum = pageNum;
        ref.name = name;

        String imageHash = generateImageHash(image);
        uniqueImages.computeIfAbsent(imageHash, k -> new ArrayList<>()).add(ref);

        return ref;
    }

    // Look for images inside form XObjects
    private void checkFormForImages(
            int pageNum,
            COSName formName,
            PDFormXObject formXObj,
            Map<String, List<ImageReference>> uniqueImages)
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

                String imageHash = generateImageHash(nestedImage);
                uniqueImages.computeIfAbsent(imageHash, k -> new ArrayList<>()).add(nestedRef);
            }
        }
    }

    // Count total images and nested images
    private void calculateImageStats(
            Map<String, List<ImageReference>> uniqueImages, CompressionStats stats) {
        for (List<ImageReference> references : uniqueImages.values()) {
            for (ImageReference ref : references) {
                stats.totalImages++;
                if (ref instanceof NestedImageReference) {
                    stats.nestedImages++;
                }
            }
        }
    }

    // Create compressed versions of all unique images
    private Map<String, PDImageXObject> createCompressedImages(
            PDDocument doc,
            Map<String, List<ImageReference>> uniqueImages,
            double scaleFactor,
            float jpegQuality,
            boolean convertToGrayscale,
            CompressionStats stats)
            throws IOException {

        Map<String, PDImageXObject> compressedVersions = new HashMap<>();

        // Process each unique image exactly once
        for (Entry<String, List<ImageReference>> entry : uniqueImages.entrySet()) {
            String imageHash = entry.getKey();
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
                compressedVersions.put(imageHash, compressedImage);
                stats.compressedImages++;

                // Update compression stats
                int compressedSize = (int) compressedImage.getCOSObject().getLength();
                stats.totalCompressedBytes += compressedSize * references.size();

                double reductionPercentage = 100.0 - ((compressedSize * 100.0) / originalSize);
                log.info(
                        "Image hash {}: Compressed from {} to {} (reduced by {}%)",
                        imageHash,
                        GeneralUtils.formatBytes(originalSize),
                        GeneralUtils.formatBytes(compressedSize),
                        String.format("%.1f", reductionPercentage));
            } else {
                log.info("Image hash {}: Not suitable for compression, skipping", imageHash);
                stats.totalCompressedBytes += originalSize * references.size();
                stats.skippedImages++;
            }
        }

        return compressedVersions;
    }

    // Get original image from a reference
    private PDImageXObject getOriginalImage(PDDocument doc, ImageReference ref) throws IOException {
        if (ref instanceof NestedImageReference) {
            // Get the nested image from within a form XObject
            NestedImageReference nestedRef = (NestedImageReference) ref;
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
    private PDImageXObject compressImage(
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

    // Replace all instances of original images with their compressed versions
    private void replaceImages(
            PDDocument doc,
            Map<String, List<ImageReference>> uniqueImages,
            Map<String, PDImageXObject> compressedVersions,
            CompressionStats stats)
            throws IOException {

        for (Entry<String, List<ImageReference>> entry : uniqueImages.entrySet()) {
            String imageHash = entry.getKey();
            List<ImageReference> references = entry.getValue();

            // Skip if no compressed version exists
            PDImageXObject compressedImage = compressedVersions.get(imageHash);
            if (compressedImage == null) continue;

            // Replace ALL instances with the compressed version
            for (ImageReference ref : references) {
                replaceImageReference(doc, ref, compressedImage);
            }
        }
    }

    // Replace a specific image reference with a compressed version
    private void replaceImageReference(
            PDDocument doc, ImageReference ref, PDImageXObject compressedImage) throws IOException {
        if (ref instanceof NestedImageReference) {
            // Replace nested image within form XObject
            NestedImageReference nestedRef = (NestedImageReference) ref;
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
    private void logCompressionStats(CompressionStats stats, long originalFileSize) {
        // Calculate image reduction percentage
        double overallImageReduction =
                stats.totalOriginalBytes > 0
                        ? 100.0 - ((stats.totalCompressedBytes * 100.0) / stats.totalOriginalBytes)
                        : 0;

        int duplicatedImages = stats.totalImages - stats.uniqueImagesCount;

        log.info(
                "Image compression summary - Total unique: {}, Compressed: {}, Skipped: {}, Duplicates: {}, Nested: {}",
                stats.uniqueImagesCount,
                stats.compressedImages,
                stats.skippedImages,
                duplicatedImages,
                stats.nestedImages);
        log.info(
                "Total original image size: {}, compressed: {} (reduced by {}%)",
                GeneralUtils.formatBytes(stats.totalOriginalBytes),
                GeneralUtils.formatBytes(stats.totalCompressedBytes),
                String.format("%.1f", overallImageReduction));
    }

    private BufferedImage convertToGrayscale(BufferedImage image) {
        BufferedImage grayImage =
                new BufferedImage(
                        image.getWidth(), image.getHeight(), BufferedImage.TYPE_BYTE_GRAY);

        Graphics2D g = grayImage.createGraphics();
        g.drawImage(image, 0, 0, null);
        g.dispose();

        return grayImage;
    }

    // Resize and optionally convert to grayscale
    private BufferedImage processAndCompressImage(
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
    private byte[] convertToBytes(BufferedImage scaledImage, float jpegQuality) throws IOException {
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

    // Hash function to identify identical images
    private String generateImageHash(PDImageXObject image) {
        try {
            // Create a stream for the raw stream data
            try (InputStream stream = image.getCOSObject().createRawInputStream()) {
                // Read up to first 8KB of data for the hash
                byte[] buffer = new byte[8192];
                int bytesRead = stream.read(buffer);
                if (bytesRead > 0) {
                    byte[] dataToHash =
                            bytesRead == buffer.length ? buffer : Arrays.copyOf(buffer, bytesRead);
                    return bytesToHexString(generatMD5(dataToHash));
                }
                return "empty-stream";
            }
        } catch (Exception e) {
            log.error("Error generating image hash", e);
            return "fallback-" + System.identityHashCode(image);
        }
    }

    private String bytesToHexString(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    private byte[] generatMD5(byte[] data) throws IOException {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            return md.digest(data); // Get the MD5 hash of the image bytes
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("MD5 algorithm not available", e);
        }
    }

    // Scale factors for different optimization levels
    private double getScaleFactorForLevel(int optimizeLevel) {
        return switch (optimizeLevel) {
            case 3 -> 0.85;
            case 4 -> 0.75;
            case 5 -> 0.65;
            case 6 -> 0.55;
            case 7 -> 0.45;
            case 8 -> 0.35;
            case 9 -> 0.25;
            case 10 -> 0.15;
            default -> 1.0;
        };
    }

    // JPEG quality for different optimization levels
    private float getJpegQualityForLevel(int optimizeLevel) {
        return switch (optimizeLevel) {
            case 3 -> 0.85f;
            case 4 -> 0.80f;
            case 5 -> 0.75f;
            case 6 -> 0.70f;
            case 7 -> 0.60f;
            case 8 -> 0.50f;
            case 9 -> 0.35f;
            case 10 -> 0.2f;
            default -> 0.7f;
        };
    }

    @PostMapping(consumes = "multipart/form-data", value = "/compress-pdf")
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

        // Create initial input file
        Path originalFile = Files.createTempFile("original_", ".pdf");
        inputFile.transferTo(originalFile.toFile());
        long inputFileSize = Files.size(originalFile);

        Path currentFile = Files.createTempFile("working_", ".pdf");
        Files.copy(originalFile, currentFile, StandardCopyOption.REPLACE_EXISTING);

        // Keep track of all temporary files for cleanup
        List<Path> tempFiles = new ArrayList<>();
        tempFiles.add(originalFile);
        tempFiles.add(currentFile);
        try {
            if (autoMode) {
                double sizeReductionRatio = expectedOutputSize / (double) inputFileSize;
                optimizeLevel = determineOptimizeLevel(sizeReductionRatio);
            }

            boolean sizeMet = false;
            boolean imageCompressionApplied = false;
            boolean qpdfCompressionApplied = false;

            if (qpdfEnabled && optimizeLevel <= 3) {
                optimizeLevel = 4;
            }

            while (!sizeMet && optimizeLevel <= 9) {
                // Apply image compression for levels 4-9
                if ((optimizeLevel >= 3 || Boolean.TRUE.equals(convertToGrayscale))
                        && !imageCompressionApplied) {
                    double scaleFactor = getScaleFactorForLevel(optimizeLevel);
                    float jpegQuality = getJpegQualityForLevel(optimizeLevel);

                    // Compress images
                    Path compressedImageFile =
                            compressImagesInPDF(
                                    currentFile,
                                    scaleFactor,
                                    jpegQuality,
                                    Boolean.TRUE.equals(convertToGrayscale));

                    tempFiles.add(compressedImageFile);
                    currentFile = compressedImageFile;
                    imageCompressionApplied = true;
                }

                // Apply QPDF compression for all levels
                if (!qpdfCompressionApplied && qpdfEnabled) {
                    applyQpdfCompression(request, optimizeLevel, currentFile, tempFiles);
                    qpdfCompressionApplied = true;
                } else if (!qpdfCompressionApplied) {
                    // If QPDF is disabled, mark as applied and log
                    if (!qpdfEnabled) {
                        log.info("Skipping QPDF compression as QPDF group is disabled");
                    }
                    qpdfCompressionApplied = true;
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
                        if (autoMode) {
                            log.info(
                                    "Maximum optimization level reached without meeting target size.");
                            sizeMet = true;
                        }
                    } else {
                        // Reset flags for next iteration with higher optimization level
                        imageCompressionApplied = false;
                        qpdfCompressionApplied = false;
                        optimizeLevel = newOptimizeLevel;
                    }
                }
            }

            // Use original if optimized file is somehow larger
            long finalFileSize = Files.size(currentFile);
            if (finalFileSize >= inputFileSize) {
                log.warn(
                        "Optimized file is larger than the original. Using the original file instead.");
                currentFile = originalFile;
            }

            String outputFilename =
                    Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                    .replaceFirst("[.][^.]+$", "")
                            + "_Optimized.pdf";

            return WebResponseUtils.pdfDocToWebResponse(
                    pdfDocumentFactory.load(currentFile.toFile()), outputFilename);

        } finally {
            // Clean up all temporary files
            for (Path tempFile : tempFiles) {
                try {
                    Files.deleteIfExists(tempFile);
                } catch (IOException e) {
                    log.warn("Failed to delete temporary file: " + tempFile, e);
                }
            }
        }
    }

    // Run QPDF compression
    private void applyQpdfCompression(
            OptimizePdfRequest request, int optimizeLevel, Path currentFile, List<Path> tempFiles)
            throws IOException {

        long preQpdfSize = Files.size(currentFile);
        log.info("Pre-QPDF file size: {}", GeneralUtils.formatBytes(preQpdfSize));

        // Map optimization levels to QPDF compression levels
        int qpdfCompressionLevel;
        if (optimizeLevel == 1) {
            qpdfCompressionLevel = 5;
        } else if (optimizeLevel == 2) {
            qpdfCompressionLevel = 9;
        } else {
            qpdfCompressionLevel = 9;
        }

        // Create output file for QPDF
        Path qpdfOutputFile = Files.createTempFile("qpdf_output_", ".pdf");
        tempFiles.add(qpdfOutputFile);

        // Build QPDF command
        List<String> command = new ArrayList<>();
        command.add("qpdf");
        if (request.getNormalize()) {
            command.add("--normalize-content=y");
        }
        if (request.getLinearize()) {
            command.add("--linearize");
        }
        command.add("--recompress-flate");
        command.add("--compression-level=" + qpdfCompressionLevel);
        command.add("--compress-streams=y");
        command.add("--object-streams=generate");
        command.add(currentFile.toString());
        command.add(qpdfOutputFile.toString());

        ProcessExecutorResult returnCode = null;
        try {
            returnCode =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF)
                            .runCommandWithOutputHandling(command);

            // Update current file to the QPDF output
            Files.copy(qpdfOutputFile, currentFile, StandardCopyOption.REPLACE_EXISTING);

            long postQpdfSize = Files.size(currentFile);
            double qpdfReduction = 100.0 - ((postQpdfSize * 100.0) / preQpdfSize);
            log.info(
                    "Post-QPDF file size: {} (reduced by {}%)",
                    GeneralUtils.formatBytes(postQpdfSize), String.format("%.1f", qpdfReduction));

        } catch (Exception e) {
            if (returnCode != null && returnCode.getRc() != 3) {
                throw new IOException("QPDF command failed", e);
            }
            // If QPDF fails, keep using the current file
            log.warn("QPDF compression failed, continuing with current file", e);
        }
    }

    // Pick optimization level based on target size
    private int determineOptimizeLevel(double sizeReductionRatio) {
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
    private int incrementOptimizeLevel(int currentLevel, long currentSize, long targetSize) {
        double currentRatio = currentSize / (double) targetSize;
        log.info("Current compression ratio: {}", String.format("%.2f", currentRatio));

        if (currentRatio > 2.0) {
            return Math.min(9, currentLevel + 3);
        } else if (currentRatio > 1.5) {
            return Math.min(9, currentLevel + 2);
        }
        return Math.min(9, currentLevel + 1);
    }
}
