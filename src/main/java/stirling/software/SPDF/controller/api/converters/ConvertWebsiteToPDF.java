package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.converters.UrlToPdfRequest;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@Tag(name = "Convert", description = "Convert APIs")
@RequestMapping("/api/v1/convert")
public class ConvertWebsiteToPDF {

    @PostMapping(consumes = "multipart/form-data", value = "/url/pdf")
    @Operation(
            summary = "Convert a URL to a PDF",
            description =
                    "This endpoint fetches content from a URL and converts it to a PDF format. Input:N/A Output:PDF Type:SISO")
    public ResponseEntity<byte[]> urlToPdf(@ModelAttribute UrlToPdfRequest request)
            throws IOException, InterruptedException {
        String URL = request.getUrlInput();

        // Validate the URL format
        if (!URL.matches("^https?://.*") || !GeneralUtils.isValidURL(URL)) {
            throw new IllegalArgumentException("Invalid URL format provided.");
        }

        // validate the URL is reachable
        if (!GeneralUtils.isURLReachable(URL)) {
            throw new IllegalArgumentException("URL is not reachable, please provide a valid URL.");
        }

        Path tempOutputFile = null;
        byte[] pdfBytes;
        try {
            // Prepare the output file path
            tempOutputFile = Files.createTempFile("output_", ".pdf");

            // Prepare the OCRmyPDF command
            List<String> command = new ArrayList<>();
            command.add("weasyprint");
            command.add(URL);
            command.add(tempOutputFile.toString());

            ProcessExecutorResult returnCode =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT)
                            .runCommandWithOutputHandling(command);

            // Read the optimized PDF file
            pdfBytes = Files.readAllBytes(tempOutputFile);
        } finally {
            // Clean up the temporary files
            Files.deleteIfExists(tempOutputFile);
        }
        // Convert URL to a safe filename
        String outputFilename = convertURLToFileName(URL);

        return WebResponseUtils.bytesToWebResponse(pdfBytes, outputFilename);
    }

    private String convertURLToFileName(String url) {
        String safeName = url.replaceAll("[^a-zA-Z0-9]", "_");
        if (safeName.length() > 50) {
            safeName = safeName.substring(0, 50); // restrict to 50 characters
        }
        return safeName + ".pdf";
    }
}
