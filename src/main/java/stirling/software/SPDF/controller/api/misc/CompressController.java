package stirling.software.SPDF.controller.api.misc;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
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
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.beans.factory.annotation.Autowired;
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
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.misc.OptimizePdfRequest;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.ImageProcessingUtils;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Slf4j
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class CompressController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @Autowired
    public CompressController(CustomPDFDocumentFactory pdfDocumentFactory) {
        this.pdfDocumentFactory = pdfDocumentFactory;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    private static class ImageReference {
        int pageNum; // Page number where the image appears
        COSName name; // The name used to reference this image
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

            // Collect all unique images by content hash
            Map<String, List<ImageReference>> uniqueImages = new HashMap<>();
            Map<String, PDImageXObject> compressedVersions = new HashMap<>();

            int totalImages = 0;

            for (int pageNum = 0; pageNum < doc.getNumberOfPages(); pageNum++) {
                PDPage page = doc.getPage(pageNum);
                PDResources res = page.getResources();
                if (res == null || res.getXObjectNames() == null) continue;

                for (COSName name : res.getXObjectNames()) {
                    PDXObject xobj = res.getXObject(name);
                    if (!(xobj instanceof PDImageXObject)) continue;

                    totalImages++;
                    PDImageXObject image = (PDImageXObject) xobj;
                    String imageHash = generateImageHash(image);

                    // Store only page number and name reference
                    ImageReference ref = new ImageReference();
                    ref.pageNum = pageNum;
                    ref.name = name;

                    uniqueImages.computeIfAbsent(imageHash, k -> new ArrayList<>()).add(ref);
                }
            }

            int uniqueImagesCount = uniqueImages.size();
            int duplicatedImages = totalImages - uniqueImagesCount;
            log.info(
                    "Found {} unique images and {} duplicated instances across {} pages",
                    uniqueImagesCount,
                    duplicatedImages,
                    doc.getNumberOfPages());

            // SECOND PASS: Process each unique image exactly once
            int compressedImages = 0;
            int skippedImages = 0;
            long totalOriginalBytes = 0;
            long totalCompressedBytes = 0;

            for (Entry<String, List<ImageReference>> entry : uniqueImages.entrySet()) {
                String imageHash = entry.getKey();
                List<ImageReference> references = entry.getValue();

                if (references.isEmpty()) continue;

                // Get the first instance of this image
                ImageReference firstRef = references.get(0);
                PDPage firstPage = doc.getPage(firstRef.pageNum);
                PDResources firstPageResources = firstPage.getResources();
                PDImageXObject originalImage =
                        (PDImageXObject) firstPageResources.getXObject(firstRef.name);

                // Track original size
                int originalSize = (int) originalImage.getCOSObject().getLength();
                totalOriginalBytes += originalSize;

                // Process this unique image once
                BufferedImage processedImage =
                        processAndCompressImage(
                                originalImage, scaleFactor, jpegQuality, convertToGrayscale);

                if (processedImage != null) {
                    // Convert to bytes for storage
                    byte[] compressedData = convertToBytes(processedImage, jpegQuality);

                    // Check if compression is beneficial
                    if (compressedData.length < originalSize || convertToGrayscale) {
                        // Create a single compressed version
                        PDImageXObject compressedImage =
                                PDImageXObject.createFromByteArray(
                                        doc,
                                        compressedData,
                                        originalImage.getCOSObject().toString());

                        // Store the compressed version only once in our map
                        compressedVersions.put(imageHash, compressedImage);

                        // Report compression stats
                        double reductionPercentage =
                                100.0 - ((compressedData.length * 100.0) / originalSize);
                        log.info(
                                "Image hash {}: Compressed from {} to {} (reduced by {}%)",
                                imageHash,
                                GeneralUtils.formatBytes(originalSize),
                                GeneralUtils.formatBytes(compressedData.length),
                                String.format("%.1f", reductionPercentage));

                        // Replace ALL instances with the compressed version
                        for (ImageReference ref : references) {
                            // Get the page and resources when needed
                            PDPage page = doc.getPage(ref.pageNum);
                            PDResources resources = page.getResources();
                            resources.put(ref.name, compressedImage);

                            log.info(
                                    "Replaced image on page {} with compressed version",
                                    ref.pageNum + 1);
                        }

                        totalCompressedBytes += compressedData.length * references.size();
                        compressedImages++;
                    } else {
                        log.info("Image hash {}: Compression not beneficial, skipping", imageHash);
                        totalCompressedBytes += originalSize * references.size();
                        skippedImages++;
                    }
                } else {
                    log.info("Image hash {}: Not suitable for compression, skipping", imageHash);
                    totalCompressedBytes += originalSize * references.size();
                    skippedImages++;
                }
            }

            // Log compression statistics
            double overallImageReduction =
                    totalOriginalBytes > 0
                            ? 100.0 - ((totalCompressedBytes * 100.0) / totalOriginalBytes)
                            : 0;

            log.info(
                    "Image compression summary - Total unique: {}, Compressed: {}, Skipped: {}, Duplicates: {}",
                    uniqueImagesCount,
                    compressedImages,
                    skippedImages,
                    duplicatedImages);
            log.info(
                    "Total original image size: {}, compressed: {} (reduced by {}%)",
                    GeneralUtils.formatBytes(totalOriginalBytes),
                    GeneralUtils.formatBytes(totalCompressedBytes),
                    String.format("%.1f", overallImageReduction));

            // Free memory before saving
            compressedVersions.clear();
            uniqueImages.clear();

            // Save the document
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

    private BufferedImage convertToGrayscale(BufferedImage image) {
        BufferedImage grayImage =
                new BufferedImage(
                        image.getWidth(), image.getHeight(), BufferedImage.TYPE_BYTE_GRAY);

        Graphics2D g = grayImage.createGraphics();
        g.drawImage(image, 0, 0, null);
        g.dispose();

        return grayImage;
    }

    /**
     * Processes and compresses an image if beneficial. Returns the processed image if compression
     * is worthwhile, null otherwise.
     */
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

    /**
     * Converts a BufferedImage to a byte array with specified JPEG quality. Checks if compression
     * is beneficial compared to original.
     */
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

    /** Modified hash function to consistently identify identical image content */
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

    private byte[] generateImageMD5(PDImageXObject image) throws IOException {
        return generatMD5(ImageProcessingUtils.getImageData(image.getImage()));
    }

    /** Generates a hash string from a byte array */
    private String generateHashFromBytes(byte[] data) {
        try {
            // Use the existing method to generate MD5 hash
            byte[] hash = generatMD5(data);
            return bytesToHexString(hash);
        } catch (Exception e) {
            log.error("Error generating hash from bytes", e);
            // Return a unique string as fallback
            return "fallback-" + System.identityHashCode(data);
        }
    }

    // Updated scale factor method for levels 4-9
    private double getScaleFactorForLevel(int optimizeLevel) {
        return switch (optimizeLevel) {
            case 4 -> 0.9; // 90% of original size - lite image compression
            case 5 -> 0.8; // 80% of original size - lite image compression
            case 6 -> 0.7; // 70% of original size - lite image compression
            case 7 -> 0.6; // 60% of original size - intense image compression
            case 8 -> 0.5; // 50% of original size - intense image compression
            case 9, 10 -> 0.4; // 40% of original size - intense image compression
            default -> 1.0; // No image scaling for levels 1-3
        };
    }

    // New method for JPEG quality based on optimization level
    private float getJpegQualityForLevel(int optimizeLevel) {
        return switch (optimizeLevel) {
            case 7 -> 0.8f; // 80% quality - intense compression
            case 8 -> 0.6f; // 60% quality - more intense compression
            case 9, 10 -> 0.4f; // 40% quality - most intense compression
            default -> 0.7f; // 70% quality for levels 1-6 (higher quality)
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
        Path originalFile = Files.createTempFile("input_", ".pdf");
        inputFile.transferTo(originalFile.toFile());
        long inputFileSize = Files.size(originalFile);
        
        // Start with original as current working file
        Path currentFile = originalFile;
        
        // Keep track of all temporary files for cleanup
        List<Path> tempFiles = new ArrayList<>();
        tempFiles.add(originalFile);
        
        try {
            if (autoMode) {
                double sizeReductionRatio = expectedOutputSize / (double) inputFileSize;
                optimizeLevel = determineOptimizeLevel(sizeReductionRatio);
            }

            boolean sizeMet = false;
            boolean imageCompressionApplied = false;
            boolean qpdfCompressionApplied = false;

            while (!sizeMet && optimizeLevel <= 9) {
                // Apply image compression for levels 4-9
                if ((optimizeLevel >= 4 || Boolean.TRUE.equals(convertToGrayscale))
                        && !imageCompressionApplied) {
                    double scaleFactor = getScaleFactorForLevel(optimizeLevel);
                    float jpegQuality = getJpegQualityForLevel(optimizeLevel);
                    
                    // Use the returned path from compressImagesInPDF
                    Path compressedImageFile = compressImagesInPDF(
                            currentFile,
                            scaleFactor,
                            jpegQuality,
                            Boolean.TRUE.equals(convertToGrayscale));
                    
                    // Add to temp files list and update current file
                    tempFiles.add(compressedImageFile);
                    currentFile = compressedImageFile;
                    imageCompressionApplied = true;
                }

                // Apply QPDF compression for all levels
                if (!qpdfCompressionApplied) {
                    long preQpdfSize = Files.size(currentFile);
                    log.info("Pre-QPDF file size: {}", GeneralUtils.formatBytes(preQpdfSize));

                    // Map optimization levels to QPDF compression levels
                    int qpdfCompressionLevel = optimizeLevel <= 3 
                            ? optimizeLevel * 3  // Level 1->3, 2->6, 3->9
                            : 9;                 // Max compression for levels 4-9

                    // Create output file for QPDF
                    Path qpdfOutputFile = Files.createTempFile("qpdf_output_", ".pdf");
                    tempFiles.add(qpdfOutputFile);

                    // Run QPDF optimization
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
                        returnCode = ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF)
                                .runCommandWithOutputHandling(command);
                        qpdfCompressionApplied = true;
                        
                        // Update current file to the QPDF output
                        currentFile = qpdfOutputFile;
                        
                        long postQpdfSize = Files.size(currentFile);
                        double qpdfReduction = 100.0 - ((postQpdfSize * 100.0) / preQpdfSize);
                        log.info(
                                "Post-QPDF file size: {} (reduced by {}%)",
                                GeneralUtils.formatBytes(postQpdfSize),
                                String.format("%.1f", qpdfReduction));
                        
                    } catch (Exception e) {
                        if (returnCode != null && returnCode.getRc() != 3) {
                            throw e;
                        }
                        // If QPDF fails, keep using the current file
                        log.warn("QPDF compression failed, continuing with current file");
                    }
                }

                // Check if file size is within expected size or not auto mode
                long outputFileSize = Files.size(currentFile);
                if (outputFileSize <= expectedOutputSize || !autoMode) {
                    sizeMet = true;
                } else {
                    int newOptimizeLevel = incrementOptimizeLevel(
                            optimizeLevel, outputFileSize, expectedOutputSize);

                    // Check if we can't increase the level further
                    if (newOptimizeLevel == optimizeLevel) {
                        if (autoMode) {
                            log.info("Maximum optimization level reached without meeting target size.");
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

            // Check if optimized file is larger than the original
            long finalFileSize = Files.size(currentFile);
            if (finalFileSize > inputFileSize) {
                log.warn("Optimized file is larger than the original. Using the original file instead.");
                // Use the stored reference to the original file
                currentFile = originalFile;
            }

            String outputFilename = Filenames.toSimpleFileName(inputFile.getOriginalFilename())
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
