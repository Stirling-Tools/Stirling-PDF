package stirling.software.SPDF.controller.api.misc;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.plugins.jpeg.JPEGImageWriteParam;
import javax.imageio.stream.ImageOutputStream;

import org.apache.pdfbox.Loader;
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

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.misc.OptimizePdfRequest;
import stirling.software.SPDF.service.CustomPDDocumentFactory;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Slf4j
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class CompressController {

    private final CustomPDDocumentFactory pdfDocumentFactory;

    @Autowired
    public CompressController(CustomPDDocumentFactory pdfDocumentFactory) {
        this.pdfDocumentFactory = pdfDocumentFactory;
    }

    private void compressImagesInPDF(Path pdfFile, double scaleFactor, float jpegQuality) throws Exception {
        byte[] fileBytes = Files.readAllBytes(pdfFile);
        long originalFileSize = fileBytes.length;
        log.info(
                "Starting image compression with scale factor: {} and JPEG quality: {} on file size: {}",
                scaleFactor,
                jpegQuality,
                GeneralUtils.formatBytes(originalFileSize));

        // Track processed images to avoid recompression
        Set<String> processedImages = new HashSet<>();

        try (PDDocument doc = Loader.loadPDF(fileBytes)) {
            int totalImages = 0;
            int compressedImages = 0;
            int skippedImages = 0;
            long totalOriginalBytes = 0;
            long totalCompressedBytes = 0;

            // Minimum dimensions to preserve reasonable quality
            int MIN_WIDTH = 400; // Higher minimum
            int MIN_HEIGHT = 400; // Higher minimum

            log.info("PDF has {} pages", doc.getNumberOfPages());

            for (int pageNum = 0; pageNum < doc.getNumberOfPages(); pageNum++) {
                PDPage page = doc.getPage(pageNum);
                PDResources res = page.getResources();

                if (res == null || res.getXObjectNames() == null) {
                    continue;
                }

                int pageImages = 0;

                for (COSName name : res.getXObjectNames()) {
                    String imageName = name.getName();

                    // Skip already processed images
                    if (processedImages.contains(imageName)) {
                        skippedImages++;
                        continue;
                    }

                    PDXObject xobj = res.getXObject(name);
                    if (!(xobj instanceof PDImageXObject)) {
                        continue;
                    }

                    totalImages++;
                    pageImages++;
                    PDImageXObject image = (PDImageXObject) xobj;
                    BufferedImage bufferedImage = image.getImage();

                    int originalWidth = bufferedImage.getWidth();
                    int originalHeight = bufferedImage.getHeight();

                    log.info(
                            "Page {}, Image {}: Original dimensions: {}x{}",
                            pageNum + 1,
                            imageName,
                            originalWidth,
                            originalHeight);

                    // Skip if already small enough
                    if (originalWidth <= MIN_WIDTH || originalHeight <= MIN_HEIGHT) {
                        log.info(
                                "Page {}, Image {}: Skipping - below minimum dimensions threshold",
                                pageNum + 1,
                                imageName);
                        skippedImages++;
                        processedImages.add(imageName);
                        continue;
                    }

                    // Adjust scale factor for very large or very small images
                    double adjustedScaleFactor = scaleFactor;
                    if (originalWidth > 3000 || originalHeight > 3000) {
                        // More aggressive for very large images
                        adjustedScaleFactor = Math.min(scaleFactor, 0.75);
                        log.info(
                                "Page {}, Image {}: Very large image, using more aggressive scale: {}",
                                pageNum + 1,
                                imageName,
                                adjustedScaleFactor);
                    } else if (originalWidth < 1000 || originalHeight < 1000) {
                        // More conservative for smaller images
                        adjustedScaleFactor = Math.max(scaleFactor, 0.9);
                        log.info(
                                "Page {}, Image {}: Smaller image, using conservative scale: {}",
                                pageNum + 1,
                                imageName,
                                adjustedScaleFactor);
                    }

                    int newWidth = (int) (originalWidth * adjustedScaleFactor);
                    int newHeight = (int) (originalHeight * adjustedScaleFactor);

                    // Ensure minimum dimensions
                    newWidth = Math.max(newWidth, MIN_WIDTH);
                    newHeight = Math.max(newHeight, MIN_HEIGHT);

                    // Skip if change is negligible
                    if ((double) newWidth / originalWidth > 0.95
                            && (double) newHeight / originalHeight > 0.95) {
                        log.info(
                                "Page {}, Image {}: Change too small, skipping compression",
                                pageNum + 1,
                                imageName);
                        skippedImages++;
                        processedImages.add(imageName);
                        continue;
                    }

                    log.info(
                            "Page {}, Image {}: Resizing to {}x{} ({}% of original)",
                            pageNum + 1,
                            imageName,
                            newWidth,
                            newHeight,
                            Math.round((newWidth * 100.0) / originalWidth));

                    // Use high quality scaling
                    BufferedImage scaledImage =
                            new BufferedImage(
                                    newWidth,
                                    newHeight,
                                    bufferedImage.getColorModel().hasAlpha()
                                            ? BufferedImage.TYPE_INT_ARGB
                                            : BufferedImage.TYPE_INT_RGB);

                    Graphics2D g2d = scaledImage.createGraphics();
                    g2d.setRenderingHint(
                            RenderingHints.KEY_INTERPOLATION,
                            RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                    g2d.setRenderingHint(
                            RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
                    g2d.setRenderingHint(
                            RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                    g2d.drawImage(bufferedImage, 0, 0, newWidth, newHeight, null);
                    g2d.dispose();

                    // Choose appropriate format and compression
                    String format = bufferedImage.getColorModel().hasAlpha() ? "png" : "jpeg";
                    
                    // First get the actual size of the original image by encoding it to the chosen format
                    ByteArrayOutputStream originalImageStream = new ByteArrayOutputStream();
                    if (format.equals("jpeg")) {
                        // Get the best available JPEG writer (prioritizes TwelveMonkeys if available)
                        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpeg");
                        ImageWriter writer = null;

                        // Prefer TwelveMonkeys writer if available
                        while (writers.hasNext()) {
                            ImageWriter candidate = writers.next();
                            if (candidate.getClass().getName().contains("twelvemonkeys")) {
                                writer = candidate;
                                break;
                            }
                        }
                        if (writer == null) {
                            writer = ImageIO.getImageWritersByFormatName("jpeg").next();
                        }

                        JPEGImageWriteParam param =
                                (JPEGImageWriteParam) writer.getDefaultWriteParam();

                        // Set advanced compression parameters
                        param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                        param.setCompressionQuality(jpegQuality);
                        param.setOptimizeHuffmanTables(true); // Better compression
                        param.setProgressiveMode(
                                ImageWriteParam.MODE_DEFAULT); // Progressive scanning

                        // Write compressed image
                        try (ImageOutputStream ios =
                                ImageIO.createImageOutputStream(originalImageStream)) {
                            writer.setOutput(ios);
                            writer.write(null, new IIOImage(scaledImage, null, null), param);
                        }
                        writer.dispose();
                    } else {
                        ImageIO.write(bufferedImage, format, originalImageStream);
                    }
                    int originalEncodedSize = (int) image.getCOSObject().getLength();
                    originalImageStream.close();

                    // Now compress the scaled image
                    ByteArrayOutputStream compressedImageStream = new ByteArrayOutputStream();
                    if (format.equals("jpeg")) {
                        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName(format);
                        if (writers.hasNext()) {
                            ImageWriter writer = writers.next();
                            ImageWriteParam param = writer.getDefaultWriteParam();

                            if (param.canWriteCompressed()) {
                                param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                                param.setCompressionQuality(jpegQuality);

                                ImageOutputStream imageOut =
                                        ImageIO.createImageOutputStream(compressedImageStream);
                                writer.setOutput(imageOut);
                                writer.write(null, new IIOImage(scaledImage, null, null), param);
                                writer.dispose();
                                imageOut.close();
                            } else {
                                ImageIO.write(scaledImage, format, compressedImageStream);
                            }
                        } else {
                            ImageIO.write(scaledImage, format, compressedImageStream);
                        }
                    } else {
                        ImageIO.write(scaledImage, format, compressedImageStream);
                    }
                    byte[] imageBytes = compressedImageStream.toByteArray();
                    compressedImageStream.close();

                    // Format sizes using our utility method
                    String originalSizeStr = GeneralUtils.formatBytes(originalEncodedSize);
                    String compressedSizeStr = GeneralUtils.formatBytes(imageBytes.length);

                    // Calculate reduction percentage (how much smaller the new file is)
                    double reductionPercentage =
                            100.0 - ((imageBytes.length * 100.0) / originalEncodedSize);

                    if (imageBytes.length >= originalEncodedSize) {
                        log.info(
                                "Page {}, Image {}: Compressed size {} not smaller than original {}, skipping replacement",
                                pageNum + 1,
                                imageName,
                                GeneralUtils.formatBytes(imageBytes.length),
                                GeneralUtils.formatBytes(originalEncodedSize));

                        // Accumulate original size for both counters (no change)
                        totalOriginalBytes += originalEncodedSize;
                        totalCompressedBytes += originalEncodedSize;
                        skippedImages++;
                        processedImages.add(imageName);
                        continue;
                    }
                    log.info(
                            "Page {}, Image {}: Compressed from {} to {} (reduced by {}%)",
                            pageNum + 1,
                            imageName,
                            originalSizeStr,
                            compressedSizeStr,
                            String.format("%.1f", reductionPercentage));

                    // Only replace if compressed size is smaller
                    PDImageXObject compressedImage =
                            PDImageXObject.createFromByteArray(
                                    doc, imageBytes, image.getCOSObject().toString());
                    res.put(name, compressedImage);

                    // Update counters with compressed size
                    totalOriginalBytes += originalEncodedSize;
                    totalCompressedBytes += imageBytes.length;
                    compressedImages++;
                    processedImages.add(imageName);
                }
            }

            // Log overall image compression statistics
            double overallImageReduction =
                    totalOriginalBytes > 0
                            ? 100.0 - ((totalCompressedBytes * 100.0) / totalOriginalBytes)
                            : 0;

            log.info(
                    "Image compression summary - Total: {}, Compressed: {}, Skipped: {}",
                    totalImages,
                    compressedImages,
                    skippedImages);
            log.info(
                    "Total original image size: {}, compressed: {} (reduced by {:.1f}%)",
                    GeneralUtils.formatBytes(totalOriginalBytes),
                    GeneralUtils.formatBytes(totalCompressedBytes),
                    overallImageReduction);

            // Save the document
            log.info("Saving compressed PDF to {}", pdfFile.toString());
            doc.save(pdfFile.toString());

            // Log overall file size reduction
            long compressedFileSize = Files.size(pdfFile);
            double overallReduction = 100.0 - ((compressedFileSize * 100.0) / originalFileSize);
            log.info(
                    "Overall PDF compression: {} → {} (reduced by {:.1f}%)",
                    GeneralUtils.formatBytes(originalFileSize),
                    GeneralUtils.formatBytes(compressedFileSize),
                    overallReduction);
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
                    "This endpoint accepts a PDF file and optimizes it based on the provided parameters. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> optimizePdf(@ModelAttribute OptimizePdfRequest request)
            throws Exception {
        MultipartFile inputFile = request.getFileInput();
        Integer optimizeLevel = request.getOptimizeLevel();
        String expectedOutputSizeString = request.getExpectedOutputSize();

        if (expectedOutputSizeString == null && optimizeLevel == null) {
            throw new Exception("Both expected output size and optimize level are not specified");
        }

        Long expectedOutputSize = 0L;
        boolean autoMode = false;
        if (expectedOutputSizeString != null && expectedOutputSizeString.length() > 1) {
            expectedOutputSize = GeneralUtils.convertSizeToBytes(expectedOutputSizeString);
            autoMode = true;
        }

        Path tempInputFile = Files.createTempFile("input_", ".pdf");
        inputFile.transferTo(tempInputFile.toFile());

        long inputFileSize = Files.size(tempInputFile);

        Path tempOutputFile = null;
        byte[] pdfBytes;
        try {
            tempOutputFile = Files.createTempFile("output_", ".pdf");

            if (autoMode) {
                double sizeReductionRatio = expectedOutputSize / (double) inputFileSize;
                optimizeLevel = determineOptimizeLevel(sizeReductionRatio);
            }

            boolean sizeMet = false;
            boolean imageCompressionApplied = false; // Track if we've already compressed images
            boolean qpdfCompressionApplied = false;
            
            while (!sizeMet && optimizeLevel <= 9) {
                // Apply appropriate compression based on level
                
                // Levels 4-9: Apply image compression
                if (optimizeLevel >= 4 && !imageCompressionApplied) {
                    double scaleFactor = getScaleFactorForLevel(optimizeLevel);
                    float jpegQuality = getJpegQualityForLevel(optimizeLevel);
                    compressImagesInPDF(tempInputFile, scaleFactor, jpegQuality);
                    imageCompressionApplied = true; // Mark that we've compressed images
                }
                
                // All levels (1-9): Apply QPDF compression
                if (!qpdfCompressionApplied) {
                	long preQpdfSize = Files.size(tempInputFile);
                	log.info("Pre-QPDF file size: {}", GeneralUtils.formatBytes(preQpdfSize));
                	
                    // For levels 1-3, map to qpdf compression levels 1-9
                    int qpdfCompressionLevel = optimizeLevel;
                    if (optimizeLevel <= 3) {
                        qpdfCompressionLevel = optimizeLevel * 3; // Level 1->3, 2->6, 3->9
                    } else {
                        qpdfCompressionLevel = 9; // Max QPDF compression for levels 4-9
                    }
                    
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
                    command.add(tempInputFile.toString());
                    command.add(tempOutputFile.toString());

                    ProcessExecutorResult returnCode = null;
                    try {
                        returnCode =
                                ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF)
                                        .runCommandWithOutputHandling(command);
                        qpdfCompressionApplied = true;
                    } catch (Exception e) {
                        if (returnCode != null && returnCode.getRc() != 3) {
                            throw e;
                        }
                    }
                    long postQpdfSize = Files.size(tempOutputFile);
                    double qpdfReduction = 100.0 - ((postQpdfSize * 100.0) / preQpdfSize);
                    log.info(
                            "Post-QPDF file size: {} (reduced by {:.1f}%)",
                            GeneralUtils.formatBytes(postQpdfSize),
                            qpdfReduction);
                    
                } else {
                    tempOutputFile = tempInputFile;
                }

                // Check if file size is within expected size or not auto mode
                long outputFileSize = Files.size(tempOutputFile);
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
                        // Reset image compression if moving to a new level
                        imageCompressionApplied = false;
                        qpdfCompressionApplied = false;
                        optimizeLevel = newOptimizeLevel;
                    }
                }
            }

            // Read the optimized PDF file
            pdfBytes = Files.readAllBytes(tempOutputFile);
            Path finalFile = tempOutputFile;

            // Check if optimized file is larger than the original
            if (pdfBytes.length > inputFileSize) {
                log.warn(
                        "Optimized file is larger than the original. Returning the original file instead.");
                finalFile = tempInputFile;
            }

            String outputFilename =
                    Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                    .replaceFirst("[.][^.]+$", "")
                            + "_Optimized.pdf";
            return WebResponseUtils.pdfDocToWebResponse(
                    pdfDocumentFactory.load(finalFile.toFile()), outputFilename);

        } finally {
            Files.deleteIfExists(tempOutputFile);
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