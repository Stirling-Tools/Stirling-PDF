package stirling.software.SPDF.controller.api.misc;

import java.awt.Image;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import javax.imageio.ImageIO;

import org.apache.commons.io.FileUtils;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

import stirling.software.SPDF.model.api.misc.OptimizePdfRequest;
import stirling.software.SPDF.service.CustomPDDocumentFactory;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class CompressController {

    private static final Logger logger = LoggerFactory.getLogger(CompressController.class);

    private final CustomPDDocumentFactory pdfDocumentFactory;

    @Autowired
    public CompressController(CustomPDDocumentFactory pdfDocumentFactory) {
        this.pdfDocumentFactory = pdfDocumentFactory;
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

        // Save the uploaded file to a temporary location
        Path tempInputFile = Files.createTempFile("input_", ".pdf");
        inputFile.transferTo(tempInputFile.toFile());

        long inputFileSize = Files.size(tempInputFile);

        // Prepare the output file path

        Path tempOutputFile = null;
        byte[] pdfBytes;
        try {
            tempOutputFile = Files.createTempFile("output_", ".pdf");
            // Determine initial optimization level based on expected size reduction, only if in
            // autoMode
            if (autoMode) {
                double sizeReductionRatio = expectedOutputSize / (double) inputFileSize;
                if (sizeReductionRatio > 0.7) {
                    optimizeLevel = 1;
                } else if (sizeReductionRatio > 0.5) {
                    optimizeLevel = 2;
                } else if (sizeReductionRatio > 0.35) {
                    optimizeLevel = 3;
                } else {
                    optimizeLevel = 3;
                }
            }

            boolean sizeMet = false;
            while (!sizeMet && optimizeLevel <= 4) {
                // Prepare the Ghostscript command
                List<String> command = new ArrayList<>();
                command.add("gs");
                command.add("-sDEVICE=pdfwrite");
                command.add("-dCompatibilityLevel=1.5");

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
                        command.add("-dPDFSETTINGS=/screen");
                        break;
                    default:
                        command.add("-dPDFSETTINGS=/default");
                }

                command.add("-dNOPAUSE");
                command.add("-dQUIET");
                command.add("-dBATCH");
                command.add("-sOutputFile=" + tempOutputFile.toString());
                command.add(tempInputFile.toString());

                ProcessExecutorResult returnCode =
                        ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                                .runCommandWithOutputHandling(command);

                // Check if file size is within expected size or not auto mode so instantly finish
                long outputFileSize = Files.size(tempOutputFile);
                if (outputFileSize <= expectedOutputSize || !autoMode) {
                    sizeMet = true;
                } else {
                    // Increase optimization level for next iteration
                    optimizeLevel++;
                    if (autoMode && optimizeLevel > 4) {
                        logger.info("Skipping level 5 due to bad results in auto mode");
                        sizeMet = true;
                    } else {
                        logger.info(
                                "Increasing ghostscript optimisation level to " + optimizeLevel);
                    }
                }
            }

            if (expectedOutputSize != null && autoMode) {
                long outputFileSize = Files.size(tempOutputFile);
                byte[] fileBytes = Files.readAllBytes(tempOutputFile);
                if (outputFileSize > expectedOutputSize) {
                    try (PDDocument doc = Loader.loadPDF(fileBytes)) {
                        long previousFileSize = 0;
                        double scaleFactorConst = 0.9f;
                        double scaleFactor = 0.9f;
                        while (true) {
                            for (PDPage page : doc.getPages()) {
                                PDResources res = page.getResources();
                                if (res != null && res.getXObjectNames() != null) {
                                    for (COSName name : res.getXObjectNames()) {
                                        PDXObject xobj = res.getXObject(name);
                                        if (xobj != null && xobj instanceof PDImageXObject) {
                                            PDImageXObject image = (PDImageXObject) xobj;

                                            // Get the image in BufferedImage format
                                            BufferedImage bufferedImage = image.getImage();

                                            // Calculate the new dimensions
                                            int newWidth =
                                                    (int)
                                                            (bufferedImage.getWidth()
                                                                    * scaleFactorConst);
                                            int newHeight =
                                                    (int)
                                                            (bufferedImage.getHeight()
                                                                    * scaleFactorConst);

                                            // If the new dimensions are zero, skip this iteration
                                            if (newWidth == 0 || newHeight == 0) {
                                                continue;
                                            }

                                            // Otherwise, proceed with the scaling
                                            Image scaledImage =
                                                    bufferedImage.getScaledInstance(
                                                            newWidth,
                                                            newHeight,
                                                            Image.SCALE_SMOOTH);

                                            // Convert the scaled image back to a BufferedImage
                                            BufferedImage scaledBufferedImage =
                                                    new BufferedImage(
                                                            newWidth,
                                                            newHeight,
                                                            BufferedImage.TYPE_INT_RGB);
                                            scaledBufferedImage
                                                    .getGraphics()
                                                    .drawImage(scaledImage, 0, 0, null);

                                            // Compress the scaled image
                                            ByteArrayOutputStream compressedImageStream =
                                                    new ByteArrayOutputStream();
                                            ImageIO.write(
                                                    scaledBufferedImage,
                                                    "jpeg",
                                                    compressedImageStream);
                                            byte[] imageBytes = compressedImageStream.toByteArray();
                                            compressedImageStream.close();

                                            PDImageXObject compressedImage =
                                                    PDImageXObject.createFromByteArray(
                                                            doc,
                                                            imageBytes,
                                                            image.getCOSObject().toString());

                                            // Replace the image in the resources with the
                                            // compressed
                                            // version
                                            res.put(name, compressedImage);
                                        }
                                    }
                                }
                            }

                            // save the document to tempOutputFile again
                            doc.save(tempOutputFile.toString());

                            long currentSize = Files.size(tempOutputFile);
                            // Check if the overall PDF size is still larger than expectedOutputSize
                            if (currentSize > expectedOutputSize) {
                                // Log the current file size and scaleFactor

                                logger.info(
                                        "Current file size: "
                                                + FileUtils.byteCountToDisplaySize(currentSize));
                                logger.info("Current scale factor: " + scaleFactor);

                                // The file is still too large, reduce scaleFactor and try again
                                scaleFactor *= 0.9f; // reduce scaleFactor by 10%
                                // Avoid scaleFactor being too small, causing the image to shrink to
                                // 0
                                if (scaleFactor < 0.2f || previousFileSize == currentSize) {
                                    throw new RuntimeException(
                                            "Could not reach the desired size without excessively degrading image quality, lowest size recommended is "
                                                    + FileUtils.byteCountToDisplaySize(currentSize)
                                                    + ", "
                                                    + currentSize
                                                    + " bytes");
                                }
                                previousFileSize = currentSize;
                            } else {
                                // The file is small enough, break the loop
                                break;
                            }
                        }
                    }
                }
            }
            // Read the optimized PDF file
            pdfBytes = Files.readAllBytes(tempOutputFile);
            Path finalFile = tempOutputFile;
            // Check if optimized file is larger than the original
            if (pdfBytes.length > inputFileSize) {
                // Log the occurrence
                logger.warn(
                        "Optimized file is larger than the original. Returning the original file instead.");

                // Read the original file again
                finalFile = tempInputFile;
            }
            // Return the optimized PDF as a response
            String outputFilename =
                    Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                    .replaceFirst("[.][^.]+$", "")
                            + "_Optimized.pdf";
            return WebResponseUtils.pdfDocToWebResponse(
                    pdfDocumentFactory.load(finalFile.toFile()), outputFilename);

        } finally {
            // Clean up the temporary files
            // deleted by multipart file handler deu to transferTo?
            // Files.deleteIfExists(tempInputFile);
            Files.deleteIfExists(tempOutputFile);
        }
    }
}
