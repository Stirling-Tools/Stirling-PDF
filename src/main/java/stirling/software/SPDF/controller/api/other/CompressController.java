package stirling.software.SPDF.controller.api.other;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

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
    @Operation(
        summary = "Optimize PDF file",
        description = "This endpoint accepts a PDF file and optimizes it based on the provided parameters."
    )
    public ResponseEntity<byte[]> optimizePdf(
        @RequestPart(required = true, value = "fileInput")
        @Parameter(description = "The input PDF file to be optimized.", required = true)
            MultipartFile inputFile,
        @RequestParam("optimizeLevel")
        @Parameter(description = "The level of optimization to apply to the PDF file. Higher values indicate greater compression but may reduce quality.", 
                    schema = @Schema(allowableValues = {"0", "1", "2", "3"}), example = "1")
            int optimizeLevel,
        @RequestParam(name = "fastWebView", required = false)
        @Parameter(description = "If true, optimize the PDF for fast web view. This increases the file size by about 25%.", example = "false")
            Boolean fastWebView,
        @RequestParam(name = "jbig2Lossy", required = false)
        @Parameter(description = "If true, apply lossy JB2 compression to the PDF file.", example = "false")
            Boolean jbig2Lossy)
        throws IOException, InterruptedException {

        // Save the uploaded file to a temporary location
        Path tempInputFile = Files.createTempFile("input_", ".pdf");
        inputFile.transferTo(tempInputFile.toFile());

        // Prepare the output file path
        Path tempOutputFile = Files.createTempFile("output_", ".pdf");

        // Prepare the OCRmyPDF command
        List<String> command = new ArrayList<>();
        command.add("ocrmypdf");
        command.add("--skip-text");
        command.add("--tesseract-timeout=0");
        command.add("--optimize");
        command.add(String.valueOf(optimizeLevel));
        command.add("--output-type");
        command.add("pdf");

        if (fastWebView != null && fastWebView) {
            long fileSize = inputFile.getSize();
            long fastWebViewSize = (long) (fileSize * 1.25); // 25% higher than file size
            command.add("--fast-web-view");
            command.add(String.valueOf(fastWebViewSize));
        }

        if (jbig2Lossy != null && jbig2Lossy) {
            command.add("--jbig2-lossy");
        }

        command.add(tempInputFile.toString());
        command.add(tempOutputFile.toString());

        int returnCode = ProcessExecutor.getInstance(ProcessExecutor.Processes.OCR_MY_PDF).runCommandWithOutputHandling(command);

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
