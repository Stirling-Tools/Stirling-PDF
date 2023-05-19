package stirling.software.SPDF.controller.api.other;

import java.awt.Image;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageOutputStream;

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
import stirling.software.SPDF.utils.PdfUtils;
import stirling.software.SPDF.utils.ProcessExecutor;
import io.swagger.v3.oas.annotations.media.Schema;

@RestController
public class CompressController {

    private static final Logger logger = LoggerFactory.getLogger(CompressController.class);

    @PostMapping(consumes = "multipart/form-data", value = "/compress-pdf")
    @Operation(summary = "Optimize PDF file", description = "This endpoint accepts a PDF file and optimizes it based on the provided parameters.")
    public ResponseEntity<byte[]> optimizePdf(
            @RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file to be optimized.", required = true) MultipartFile inputFile,
            @RequestParam("optimizeLevel") @Parameter(description = "The level of optimization to apply to the PDF file. Higher values indicate greater compression but may reduce quality.", schema = @Schema(allowableValues = {
                    "0", "1", "2", "3" }), example = "1") int optimizeLevel,
            @RequestParam("expectedOutputSize") @Parameter(description = "The expected output size in bytes.", required = false) Long expectedOutputSize)
            throws IOException, InterruptedException {

        // Save the uploaded file to a temporary location
        Path tempInputFile = Files.createTempFile("input_", ".pdf");
        inputFile.transferTo(tempInputFile.toFile());

        // Prepare the output file path
        Path tempOutputFile = Files.createTempFile("output_", ".pdf");

        // Prepare the Ghostscript command
        List<String> command = new ArrayList<>();
        command.add("gs");
        command.add("-sDEVICE=pdfwrite");
        command.add("-dCompatibilityLevel=1.4");

        switch (optimizeLevel) {
        case 0:
            command.add("-dPDFSETTINGS=/default");
            break;
        case 1:
            command.add("-dPDFSETTINGS=/ebook");
            break;
        case 2:
            command.add("-dPDFSETTINGS=/printer");
            break;
        case 3:
            command.add("-dPDFSETTINGS=/prepress");
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

        if (expectedOutputSize != null) {
            long outputFileSize = Files.size(tempOutputFile);
            if (outputFileSize > expectedOutputSize) {
                try (PDDocument doc = PDDocument.load(new File(tempOutputFile.toString()))) {
                   
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

                        // Check if the overall PDF size is still larger than expectedOutputSize
                        if (Files.size(tempOutputFile) > expectedOutputSize) {
                            // The file is still too large, reduce scaleFactor and try again
                            scaleFactor *= 0.9; // reduce scaleFactor by 10%
                            // Avoid scaleFactor being too small, causing the image to shrink to 0
                            if(scaleFactor < 0.1){
                                throw new RuntimeException("Could not reach the desired size without excessively degrading image quality");
                            }
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
        return PdfUtils.bytesToWebResponse(pdfBytes, outputFilename);
    }

}
