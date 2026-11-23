package stirling.software.SPDF.controller.api.misc;

import java.awt.*;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.*;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
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
                if (lineArtConversionService == null
                        || !endpointConfiguration.isGroupEnabled("LineArt")) {
                    throw new ResponseStatusException(
                            HttpStatus.FORBIDDEN,
                            "Line art conversion is unavailable on this server");
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
        TempFile lineArtFile = tempFileManager.createManagedTempFile(".pdf");
        tempFiles.add(lineArtFile);
        lineArtConversionService.convertToLineArt(
                currentFile, lineArtFile.getPath(), threshold, edgeLevel);
        return lineArtFile.getPath();
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
