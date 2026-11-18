package stirling.software.SPDF.controller.api.misc;

import java.awt.*;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.*;
import java.util.List;
import java.util.Map.Entry;
import java.util.Objects;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImage;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Operation;

import lombok.*;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.misc.OptimizePdfRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.LineArtConversionService;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ImageMemoryLimit;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.officeconvert.optimize.PdfOptimizer;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class CompressController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final EndpointConfiguration endpointConfiguration;
    private final TempFileManager tempFileManager;

    @Autowired(required = false)
    private LineArtConversionService lineArtConversionService;

    private boolean isQpdfEnabled() {
        return endpointConfiguration.isGroupEnabled("qpdf");
    }

    private boolean isImageMagickEnabled() {
        return endpointConfiguration.isGroupEnabled("ImageMagick");
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

    private static void replaceImages(
            PDDocument doc,
            Map<ImageIdentity, List<ImageReference>> uniqueImages,
            Map<ImageIdentity, PDImageXObject> compressedVersions)
            throws IOException {

        for (Entry<ImageIdentity, List<ImageReference>> entry : uniqueImages.entrySet()) {
            ImageIdentity imageIdentity = entry.getKey();
            List<ImageReference> references = entry.getValue();

            PDImageXObject compressedImage = compressedVersions.get(imageIdentity);
            if (compressedImage == null) continue;

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
                    if (!ImageMemoryLimit.embeddedImageFits((PDImageXObject) xobj)) {
                        log.info(
                                "Leaving image '{}' on page {} uncompressed: over the image limit",
                                name.getName(),
                                pageNum + 1);
                        continue;
                    }
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
                if (!ImageMemoryLimit.embeddedImageFits(nestedImage)) {
                    log.info(
                            "Leaving image '{}' in form '{}' on page {} uncompressed: over the"
                                    + " image limit",
                            nestedName.getName(),
                            formName.getName(),
                            pageNum + 1);
                    continue;
                }

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

    private static String generateImageHash(PDImageXObject image) {
        try {
            try (InputStream stream = image.getCOSObject().createRawInputStream()) {
                byte[] buffer = new byte[16384];
                int bytesRead = stream.read(buffer);
                if (bytesRead > 0) {
                    byte[] dataToHash =
                            bytesRead == buffer.length ? buffer : Arrays.copyOf(buffer, bytesRead);

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

                    return bytesToHexString(
                            generateMD5(enhancedData.getBytes(StandardCharsets.UTF_8)));
                }
                return "empty-stream";
            }
        } catch (Exception e) {
            ExceptionUtils.logException("image hash generation", e);
            return "fallback-" + System.identityHashCode(image);
        }
    }

    private static String generateMaskHash(PDImageXObject image) {
        try {
            PDImageXObject mask = image.getMask();
            if (mask == null) {
                mask = image.getSoftMask();
            }

            if (mask != null) {
                try (InputStream stream = mask.getCOSObject().createRawInputStream()) {
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

            return bytesToHexString(
                    generateMD5(params.toString().getBytes(StandardCharsets.UTF_8)));
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
            this.metadataHash = ImageIdentity.generateMetadataHash(image);
        }

        // Generate hash of image metadata
        private static String generateMetadataHash(PDImageXObject image) {
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

                return bytesToHexString(
                        generateMD5(metadata.toString().getBytes(StandardCharsets.UTF_8)));
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

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/compress-pdf",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Optimize PDF file",
            description =
                    "This endpoint accepts a PDF file and optimizes it based on the provided"
                            + " parameters.")
    public ResponseEntity<Resource> optimizePdf(@ModelAttribute OptimizePdfRequest request)
            throws Exception {
        MultipartFile inputFile = request.getFileInput();

        // Validate input file
        if (inputFile == null || inputFile.isEmpty()) {
            throw ExceptionUtils.createFileNullOrEmptyException();
        }

        Integer optimizeLevel = request.getOptimizeLevel();
        String expectedOutputSizeString = request.getExpectedOutputSize();
        Boolean convertToGrayscale = request.getGrayscale();
        Boolean convertToLineArt = request.getLineArt();
        Double lineArtThreshold = request.getLineArtThreshold();
        Integer lineArtEdgeLevel = request.getLineArtEdgeLevel();
        if (expectedOutputSizeString == null && optimizeLevel == null) {
            throw ExceptionUtils.createCompressionOptionsRequiredException();
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

        try {
            if (autoMode) {
                double sizeReductionRatio = expectedOutputSize / (double) inputFileSize;
                optimizeLevel = determineOptimizeLevel(sizeReductionRatio);
            }

            Path workingInput = originalFile;
            if (Boolean.TRUE.equals(convertToLineArt)) {
                if (lineArtConversionService == null) {
                    throw new ResponseStatusException(
                            HttpStatus.FORBIDDEN,
                            "Line art conversion is unavailable - ImageMagick service not found");
                }
                if (!isImageMagickEnabled()) {
                    throw new IOException(
                            "ImageMagick is not enabled but line art conversion was requested");
                }
                double thresholdValue =
                        lineArtThreshold == null
                                ? 55d
                                : Math.min(100d, Math.max(0d, lineArtThreshold));
                int edgeLevel =
                        lineArtEdgeLevel == null ? 1 : Math.min(3, Math.max(1, lineArtEdgeLevel));
                workingInput =
                        applyLineArtConversion(originalFile, tempFiles, thresholdValue, edgeLevel);
            }

            TempFile best = null;
            while (true) {
                TempFile attempt = compressOnce(request, optimizeLevel, workingInput, tempFiles);
                long attemptSize = Files.size(attempt.getPath());
                if (best == null || attemptSize < Files.size(best.getPath())) {
                    best = attempt;
                }
                if (!autoMode || attemptSize <= expectedOutputSize) {
                    break;
                }
                int next = incrementOptimizeLevel(optimizeLevel, attemptSize, expectedOutputSize);
                if (next == optimizeLevel) {
                    log.info("Maximum optimization level reached without meeting target size.");
                    break;
                }
                optimizeLevel = next;
            }

            String outputFilename =
                    GeneralUtils.generateFilename(inputFile.getOriginalFilename(), ".pdf");

            // Return the upload byte for byte when nothing was gained: the frontend reports "could
            // not be compressed further" by the size being unchanged.
            if (!Boolean.TRUE.equals(convertToGrayscale)
                    && Files.size(best.getPath()) >= inputFileSize) {
                log.info("Compression did not reduce the file size. Returning the original file.");
                tempFiles.remove(originalTempFile);
                return WebResponseUtils.pdfFileToWebResponse(originalTempFile, outputFilename);
            }
            tempFiles.remove(best);
            return WebResponseUtils.pdfFileToWebResponse(best, outputFilename);

        } finally {
            for (TempFile tempFile : tempFiles) {
                try {
                    tempFile.close();
                } catch (Exception e) {
                    log.warn("Failed to delete temporary file: {}", tempFile, e);
                }
            }
        }
    }

    /**
     * One full pass from {@code input}, so target-size retries never recompress an
     * already-compressed file.
     */
    private TempFile compressOnce(
            OptimizePdfRequest request, int optimizeLevel, Path input, List<TempFile> tempFiles)
            throws IOException {
        TempFile work = tempFileManager.createManagedTempFile(".pdf");
        tempFiles.add(work);
        Files.copy(input, work.getPath(), StandardCopyOption.REPLACE_EXISTING);
        boolean grayscale = Boolean.TRUE.equals(request.getGrayscale());
        PdfOptimizer.Images images =
                optimizeLevel >= 4
                        ? new PdfOptimizer.Images(
                                targetDpiForLevel(optimizeLevel),
                                imageQualityForLevel(optimizeLevel))
                        : null;

        if (!optimize(work.getPath(), images, grayscale) && isQpdfEnabled()) {
            try {
                applyQpdfCompression(request, optimizeLevel, work.getPath());
            } catch (IOException e) {
                log.warn("QPDF compression failed: {}", e.getMessage());
            }
        }
        if ((Boolean.TRUE.equals(request.getLinearize())
                        || Boolean.TRUE.equals(request.getNormalize()))
                && isQpdfEnabled()
                && !isSigned(work.getPath())) {
            applyQpdfFinishing(request, work.getPath());
        }
        return work;
    }

    private boolean isSigned(Path file) {
        try (PDDocument doc = pdfDocumentFactory.load(file.toFile())) {
            return doc == null || !doc.getSignatureDictionaries().isEmpty();
        } catch (IOException | RuntimeException e) {
            // Unreadable here means unknown, and rewriting a signed file breaks its signature.
            return true;
        }
    }

    private static int targetDpiForLevel(int optimizeLevel) {
        return switch (optimizeLevel) {
            case 4 -> 200;
            case 5, 6 -> 150;
            case 7 -> 120;
            case 8 -> 96;
            default -> optimizeLevel >= 9 ? 72 : 300;
        };
    }

    private static float imageQualityForLevel(int optimizeLevel) {
        return switch (optimizeLevel) {
            case 4 -> 0.80f;
            case 5 -> 0.70f;
            case 6 -> 0.60f;
            case 7 -> 0.50f;
            case 8 -> 0.40f;
            default -> optimizeLevel >= 9 ? 0.30f : 0.85f;
        };
    }

    private boolean optimize(Path file, PdfOptimizer.Images images, boolean grayscale) {
        PdfOptimizer.Options options =
                PdfOptimizer.Options.defaults()
                        .timeout(Duration.ofMinutes(10))
                        .images(images)
                        .grayscale(grayscale);
        try (TempFile out = tempFileManager.createManagedTempFile(".pdf")) {
            PdfOptimizer.Result result = PdfOptimizer.optimize(file, out.getPath(), options);
            log.info(
                    "Optimised {} -> {} (images: {}, grayscale: {}, rewritten: {}, warnings: {})",
                    GeneralUtils.formatBytes(result.inputBytes()),
                    GeneralUtils.formatBytes(result.outputBytes()),
                    images,
                    grayscale,
                    result.rewritten(),
                    result.warnings());
            if (result.rewritten() && (grayscale || Files.size(out.getPath()) < Files.size(file))) {
                Files.move(out.getPath(), file, StandardCopyOption.REPLACE_EXISTING);
            }
            return true;
        } catch (IOException | RuntimeException e) {
            log.warn("Optimisation failed, falling back to qpdf: {}", e.getMessage());
            return false;
        }
    }

    private void applyQpdfFinishing(OptimizePdfRequest request, Path file) throws IOException {
        List<String> command = new ArrayList<>();
        command.add("qpdf");
        if (Boolean.TRUE.equals(request.getNormalize())) {
            command.add("--normalize-content=y");
        }
        if (Boolean.TRUE.equals(request.getLinearize())) {
            command.add("--linearize");
            // qpdf writes a wrong outlines hint table when it keeps another writer's object streams
            // as they are. Regenerate them, but only where some exist: PDF/A-1 forbids them.
            if (containsObjectStreams(file)) {
                command.add("--object-streams=generate");
            }
        }
        try (TempFile out = tempFileManager.createManagedTempFile(".pdf")) {
            command.add(file.toString());
            command.add(out.getPath().toString());
            try {
                ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF)
                        .runCommandWithOutputHandling(command, null);
            } catch (InterruptedException e) {
                throw ExceptionUtils.createProcessingInterruptedException("QPDF", e);
            } catch (IOException e) {
                log.warn("QPDF linearize/normalize failed: {}", e.getMessage());
                return;
            }
            if (Files.size(out.getPath()) > 0) {
                Files.move(out.getPath(), file, StandardCopyOption.REPLACE_EXISTING);
            }
        }
    }

    private static boolean containsObjectStreams(Path file) throws IOException {
        byte[] marker = "/ObjStm".getBytes(StandardCharsets.US_ASCII);
        byte[] buffer = new byte[1 << 16];
        int carried = 0;
        try (InputStream in = Files.newInputStream(file)) {
            int read;
            while ((read = in.read(buffer, carried, buffer.length - carried)) > 0) {
                int end = carried + read;
                for (int i = 0; i + marker.length <= end; i++) {
                    if (Arrays.equals(buffer, i, i + marker.length, marker, 0, marker.length)) {
                        return true;
                    }
                }
                carried = Math.min(marker.length - 1, end);
                System.arraycopy(buffer, end - carried, buffer, 0, carried);
            }
        }
        return false;
    }

    private Path applyLineArtConversion(
            Path currentFile, List<TempFile> tempFiles, double threshold, int edgeLevel)
            throws IOException {

        TempFile lineArtFile = new TempFile(tempFileManager, ".pdf");
        tempFiles.add(lineArtFile);

        try (PDDocument doc = pdfDocumentFactory.load(currentFile.toFile())) {
            Map<ImageIdentity, List<ImageReference>> uniqueImages = findImages(doc);
            CompressionStats stats = new CompressionStats();
            stats.uniqueImagesCount = uniqueImages.size();
            calculateImageStats(uniqueImages, stats);

            Map<ImageIdentity, PDImageXObject> convertedImages =
                    createLineArtImages(doc, uniqueImages, stats, threshold, edgeLevel);

            replaceImages(doc, uniqueImages, convertedImages);

            log.info(
                    "Applied line art conversion to {} unique images ({} total references)",
                    stats.uniqueImagesCount,
                    stats.totalImages);

            doc.save(lineArtFile.getPath().toString());
            return lineArtFile.getPath();
        }
    }

    private Map<ImageIdentity, PDImageXObject> createLineArtImages(
            PDDocument doc,
            Map<ImageIdentity, List<ImageReference>> uniqueImages,
            CompressionStats stats,
            double threshold,
            int edgeLevel)
            throws IOException {

        Map<ImageIdentity, PDImageXObject> convertedImages = new HashMap<>();

        for (Entry<ImageIdentity, List<ImageReference>> entry : uniqueImages.entrySet()) {
            ImageIdentity imageIdentity = entry.getKey();
            List<ImageReference> references = entry.getValue();
            if (references.isEmpty()) continue;

            PDImageXObject originalImage = getOriginalImage(doc, references.getFirst());

            int originalSize = (int) originalImage.getCOSObject().getLength();
            stats.totalOriginalBytes += originalSize;

            PDImageXObject converted =
                    lineArtConversionService.convertImageToLineArt(
                            doc, originalImage, threshold, edgeLevel);
            convertedImages.put(imageIdentity, converted);
            stats.compressedImages++;

            int convertedSize = (int) converted.getCOSObject().getLength();
            stats.totalCompressedBytes += convertedSize * references.size();

            double reductionPercentage = 100.0 - ((convertedSize * 100.0) / originalSize);
            log.info(
                    "Image identity {}: Line art conversion {} → {} (reduced by {}%)",
                    imageIdentity,
                    GeneralUtils.formatBytes(originalSize),
                    GeneralUtils.formatBytes(convertedSize),
                    String.format("%.1f", reductionPercentage));
        }

        return convertedImages;
    }

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

                long postQpdfSize = Files.size(qpdfOutputPath);
                if (postQpdfSize >= preQpdfSize) {
                    log.info(
                            "QPDF output ({}) is not smaller than its input, keeping the input",
                            GeneralUtils.formatBytes(postQpdfSize));
                    return;
                }
                Files.copy(qpdfOutputPath, currentFile, StandardCopyOption.REPLACE_EXISTING);

                double qpdfReduction = 100.0 - ((postQpdfSize * 100.0) / preQpdfSize);
                log.info(
                        "Post-QPDF file size: {} (reduced by {}%)",
                        GeneralUtils.formatBytes(postQpdfSize),
                        String.format(Locale.ROOT, "%.1f", qpdfReduction));

            } catch (IOException e) {
                if (returnCode != null && returnCode.getRc() != 3) {
                    throw ExceptionUtils.createQpdfCompressionException(e);
                }
                // If QPDF fails, keep using the current file
                log.warn("QPDF compression failed, continuing with current file", e);
            } catch (InterruptedException e) {
                throw ExceptionUtils.createProcessingInterruptedException("QPDF", e);
            }
        }
    }
}
