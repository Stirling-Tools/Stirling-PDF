package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@Tag(name = "Convert", description = "Convert APIs")
public class ConvertWebsiteToPDF {

	@PostMapping(consumes = "multipart/form-data", value = "/url-to-pdf")
	@Operation(
	    summary = "Convert a URL to a PDF",
	    description = "This endpoint fetches content from a URL and converts it to a PDF format."
	)
	public ResponseEntity<byte[]> urlToPdf(
	    @RequestPart(required = true, value = "urlInput")
	    @Parameter(description = "The input URL to be converted to a PDF file", required = true)
	        String URL) throws IOException, InterruptedException {

	    // Validate the URL format
	    if(!URL.matches("^https?://.*") && GeneralUtils.isValidURL(URL)) {
	        throw new IllegalArgumentException("Invalid URL format provided.");
	    }

	    // Prepare the output file path
	    Path tempOutputFile = Files.createTempFile("output_", ".pdf");

	    // Prepare the OCRmyPDF command
	    List<String> command = new ArrayList<>();
	    command.add("weasyprint");
	    command.add(URL);
	    command.add(tempOutputFile.toString());

	    int returnCode = ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT).runCommandWithOutputHandling(command);

	    // Read the optimized PDF file
	    byte[] pdfBytes = Files.readAllBytes(tempOutputFile);

	    // Clean up the temporary files
	    Files.delete(tempOutputFile);

	    // Convert URL to a safe filename
	    String outputFilename = convertURLToFileName(URL);
	    
	    return WebResponseUtils.bytesToWebResponse(pdfBytes, outputFilename);
	}

	private String convertURLToFileName(String url) {
	    String safeName = url.replaceAll("[^a-zA-Z0-9]", "_");
	    if(safeName.length() > 50) {
	        safeName = safeName.substring(0, 50); // restrict to 50 characters
	    }
	    return safeName + ".pdf";
	}


}
