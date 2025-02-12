package stirling.software.SPDF.controller.api.misc;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

import javax.imageio.ImageIO;

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

    private void compressImagesInPDF(Path pdfFile, double initialScaleFactor) throws Exception {
        byte[] fileBytes = Files.readAllBytes(pdfFile);
        try (PDDocument doc = Loader.loadPDF(fileBytes)) {
            double scaleFactor = initialScaleFactor;

            for (PDPage page : doc.getPages()) {
                PDResources res = page.getResources();
                if (res != null && res.getXObjectNames() != null) {
                    for (COSName name : res.getXObjectNames()) {
                        PDXObject xobj = res.getXObject(name);
                        if (xobj instanceof PDImageXObject) {
                            PDImageXObject image = (PDImageXObject) xobj;
                            BufferedImage bufferedImage = image.getImage();

                            int newWidth = (int) (bufferedImage.getWidth() * scaleFactor);
                            int newHeight = (int) (bufferedImage.getHeight() * scaleFactor);

                            if (newWidth == 0 || newHeight == 0) {
                                continue;
                            }

                            Image scaledImage =
                                    bufferedImage.getScaledInstance(
                                            newWidth, newHeight, Image.SCALE_SMOOTH);

                            BufferedImage scaledBufferedImage =
                                    new BufferedImage(
                                            newWidth, newHeight, BufferedImage.TYPE_INT_RGB);
                            scaledBufferedImage.getGraphics().drawImage(scaledImage, 0, 0, null);

                            ByteArrayOutputStream compressedImageStream =
                                    new ByteArrayOutputStream();
                            ImageIO.write(scaledBufferedImage, "jpeg", compressedImageStream);
                            byte[] imageBytes = compressedImageStream.toByteArray();
                            compressedImageStream.close();

                            PDImageXObject compressedImage =
                                    PDImageXObject.createFromByteArray(
                                            doc, imageBytes, image.getCOSObject().toString());
                            res.put(name, compressedImage);
                        }
                    }
                }
            }
            Path tempOutput = Files.createTempFile("output_", ".pdf");
            doc.save(tempOutput.toString());
            Files.move(tempOutput, pdfFile, StandardCopyOption.REPLACE_EXISTING);
        }
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
            while (!sizeMet && optimizeLevel <= 9) {

                // Apply additional image compression for levels 6-9
                if (optimizeLevel >= 6) {
                    // Calculate scale factor based on optimization level
                    double scaleFactor =
                            switch (optimizeLevel) {
                                case 6 -> 0.9; // 90% of original size
                                case 7 -> 0.8; // 80% of original size
                                case 8 -> 0.65; // 70% of original size
                                case 9 -> 0.5; // 60% of original size
                                default -> 1.0;
                            };
                    compressImagesInPDF(tempInputFile, scaleFactor);
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
                command.add("--optimize-images");
                command.add("--recompress-flate");
                command.add("--compression-level=" + optimizeLevel);
                command.add("--compress-streams=y");
                command.add("--object-streams=generate");
                command.add(tempInputFile.toString());
                command.add(tempOutputFile.toString());

                ProcessExecutorResult returnCode = null;
                try {
                    returnCode =
                            ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF)
                                    .runCommandWithOutputHandling(command);
                } catch (Exception e) {
                    if (returnCode != null && returnCode.getRc() != 3) {
                        throw e;
                    }
                }

                // Check if file size is within expected size or not auto mode
                long outputFileSize = Files.size(tempOutputFile);
                if (outputFileSize <= expectedOutputSize || !autoMode) {
                    sizeMet = true;
                } else {
                    optimizeLevel =
                            incrementOptimizeLevel(
                                    optimizeLevel, outputFileSize, expectedOutputSize);
                    if (autoMode && optimizeLevel >= 9) {
                        log.info("Maximum compression level reached in auto mode");
                        sizeMet = true;
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
        if (sizeReductionRatio > 0.5) return 5;
        if (sizeReductionRatio > 0.4) return 6;
        if (sizeReductionRatio > 0.3) return 7;
        if (sizeReductionRatio > 0.2) return 8;
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
