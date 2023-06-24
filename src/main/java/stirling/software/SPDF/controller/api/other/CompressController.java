package stirling.software.SPDF.controller.api.other;

import java.awt.Image;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import javax.imageio.ImageIO;

import org.apache.commons.io.FileUtils;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
public class CompressController {

    private static final Logger logger = LoggerFactory.getLogger(CompressController.class);

    @PostMapping(consumes = "multipart/form-data", value = "/compress-pdf")
    @Operation(summary = "Optimize PDF file", description = "This endpoint accepts a PDF file and optimizes it based on the provided parameters. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> optimizePdf(
            @RequestPart(value = "fileInput") @Parameter(description = "The input PDF file to be optimized.", required = true) MultipartFile inputFile,
            @RequestParam(required = false, value = "optimizeLevel") @Parameter(description = "The level of optimization to apply to the PDF file. Higher values indicate greater compression but may reduce quality.", schema = @Schema(allowableValues = {
                    "1", "2", "3", "4", "5" })) Integer optimizeLevel,
            @RequestParam(value = "expectedOutputSize", required = false) @Parameter(description = "The expected output size, e.g. '100MB', '25KB', etc.", required = false) String expectedOutputSizeString)
            throws Exception {

        if(expectedOutputSizeString == null && optimizeLevel == null) {
            throw new Exception("Both expected output size and optimize level are not specified");
        }

        Long expectedOutputSize = 0L;
        boolean autoMode = false;
        if (expectedOutputSizeString != null && expectedOutputSizeString.length() > 1 ) {
            expectedOutputSize = GeneralUtils.convertSizeToBytes(expectedOutputSizeString);
            autoMode = true;
        }

        // Save the uploaded file to a temporary location
        Path tempInputFile = Files.createTempFile("input_", ".pdf");
        inputFile.transferTo(tempInputFile.toFile());

        long inputFileSize = Files.size(tempInputFile);

        // Prepare the output file path
        Path tempOutputFile = Files.createTempFile("output_", ".pdf");

        // Determine initial optimization level based on expected size reduction, only if in autoMode
        if(autoMode) {
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
            command.add("-dCompatibilityLevel=1.4");

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

            int returnCode = ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT).runCommandWithOutputHandling(command);

            // Check if file size is within expected size or not auto mode so instantly finish
            long outputFileSize = Files.size(tempOutputFile);
            if (outputFileSize <= expectedOutputSize || !autoMode) {
                sizeMet = true;
            } else {
                // Increase optimization level for next iteration
                optimizeLevel++;
                if(autoMode && optimizeLevel > 3) {
                    System.out.println("Skipping level 4 due to bad results in auto mode");
                    sizeMet = true;
                } else if(optimizeLevel == 5) {
                    
                } else {
                    System.out.println("Increasing ghostscript optimisation level to " + optimizeLevel);
                }
            }
        }

        

        if (expectedOutputSize != null && autoMode) {
            long outputFileSize = Files.size(tempOutputFile);
            if (outputFileSize > expectedOutputSize) {
                try (PDDocument doc = PDDocument.load(new File(tempOutputFile.toString()))) {
                    long previousFileSize = 0;
                    double scaleFactor = 1.0;
                    while (true) {
                        for (PDPage page : doc.getPages()) {
                            PDResources res = page.getResources();

                            for (COSName name : res.getXObjectNames()) {
                                PDXObject xobj = res.getXObject(name);
                                if (xobj instanceof PDImageXObject) {
                                    PDImageXObject image = (PDImageXObject) xobj;

                                    // Get the image in BufferedImage format
                                    BufferedImage bufferedImage = image.getImage();

                                    // Calculate the new dimensions
                                    int newWidth = (int)(bufferedImage.getWidth() * scaleFactor);
                                    int newHeight = (int)(bufferedImage.getHeight() * scaleFactor);

                                    // If the new dimensions are zero, skip this iteration
                                    if (newWidth == 0 || newHeight == 0) {
                                        continue;
                                    }

                                    // Otherwise, proceed with the scaling
                                    Image scaledImage = bufferedImage.getScaledInstance(newWidth, newHeight, Image.SCALE_SMOOTH);

                                    // Convert the scaled image back to a BufferedImage
                                    BufferedImage scaledBufferedImage = new BufferedImage(newWidth, newHeight, BufferedImage.TYPE_INT_RGB);
                                    scaledBufferedImage.getGraphics().drawImage(scaledImage, 0, 0, null);

                                    // Compress the scaled image
                                    ByteArrayOutputStream compressedImageStream = new ByteArrayOutputStream();
                                    ImageIO.write(scaledBufferedImage, "jpeg", compressedImageStream);
                                    byte[] imageBytes = compressedImageStream.toByteArray();
                                    compressedImageStream.close();

                                    // Convert compressed image back to PDImageXObject
                                    ByteArrayInputStream bais = new ByteArrayInputStream(imageBytes);
                                    PDImageXObject compressedImage = PDImageXObject.createFromByteArray(doc, imageBytes, image.getCOSObject().toString());

                                    // Replace the image in the resources with the compressed version
                                    res.put(name, compressedImage);
                                }
                            }
                        }

                        // save the document to tempOutputFile again
                        doc.save(tempOutputFile.toString());

                        long currentSize = Files.size(tempOutputFile);
                        // Check if the overall PDF size is still larger than expectedOutputSize
                        if (currentSize > expectedOutputSize) {
                         // Log the current file size and scaleFactor
                            
                            System.out.println("Current file size: " + FileUtils.byteCountToDisplaySize(currentSize));
                            System.out.println("Current scale factor: " + scaleFactor);

                            // The file is still too large, reduce scaleFactor and try again
                            scaleFactor *= 0.9; // reduce scaleFactor by 10%
                            // Avoid scaleFactor being too small, causing the image to shrink to 0
                            if(scaleFactor < 0.2 || previousFileSize == currentSize){
                                throw new RuntimeException("Could not reach the desired size without excessively degrading image quality, lowest size recommended is " + FileUtils.byteCountToDisplaySize(currentSize) + ", " + currentSize + " bytes");
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
        byte[] pdfBytes = Files.readAllBytes(tempOutputFile);

        // Clean up the temporary files
        Files.delete(tempInputFile);
        Files.delete(tempOutputFile);

        // Return the optimized PDF as a response
        String outputFilename = inputFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_Optimized.pdf";
        return WebResponseUtils.bytesToWebResponse(pdfBytes, outputFilename);
    }

}
