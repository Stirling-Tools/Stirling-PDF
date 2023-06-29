package stirling.software.SPDF.controller.api.filters;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.utils.PdfUtils;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@Tag(name = "Filter", description = "Filter APIs")
public class FilterController {

	@PostMapping(consumes = "multipart/form-data", value = "/contains-text")
	@Operation(summary = "Checks if a PDF contains set text, returns true if does", description = "Input:PDF Output:Boolean Type:SISO")
	public Boolean containsText(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file to be converted to a PDF/A file", required = true) MultipartFile inputFile,
			@Parameter(description = "The text to check for", required = true) String text,
			@Parameter(description = "The page number to check for text on accepts 'All', ranges like '1-4'", required = false) String pageNumber)
			throws IOException, InterruptedException {
		PDDocument pdfDocument = PDDocument.load(inputFile.getInputStream());
		return PdfUtils.hasText(pdfDocument, pageNumber);
	}

	@PostMapping(consumes = "multipart/form-data", value = "/contains-image")
	@Operation(summary = "Checks if a PDF contains an image", description = "Input:PDF Output:Boolean Type:SISO")
	public Boolean containsImage(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file to be converted to a PDF/A file", required = true) MultipartFile inputFile,
			@Parameter(description = "The page number to check for image on accepts 'All', ranges like '1-4'", required = false) String pageNumber)
			throws IOException, InterruptedException {
		PDDocument pdfDocument = PDDocument.load(inputFile.getInputStream());
		return PdfUtils.hasImagesOnPage(null);
	}

	@PostMapping(consumes = "multipart/form-data", value = "/page-count")
	@Operation(summary = "Checks if a PDF is greater, less or equal to a setPageCount", description = "Input:PDF Output:Boolean Type:SISO")
	public ResponseEntity<byte[]> pageCount(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file to be converted to a PDF/A file", required = true) MultipartFile inputFile,
			@Parameter(description = "Page COunt", required = true) String pageCount,
			@Parameter(description = "Comparison type, accepts Greater, Equal, Less than", required = false) String comparitor)
			throws IOException, InterruptedException {
		return null;
	}

	@PostMapping(consumes = "multipart/form-data", value = "/page-size")
	@Operation(summary = "Checks if a PDF is a set size", description = "Input:PDF Output:Boolean Type:SISO")
	public ResponseEntity<byte[]> pageSize(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file to be converted to a PDF/A file", required = true) MultipartFile inputFile)
			throws IOException, InterruptedException {
		return null;
	}

	@PostMapping(consumes = "multipart/form-data", value = "/page-rotation")
	@Operation(summary = "Checks if a PDF is a set rotation", description = "Input:PDF Output:Boolean Type:SISO")
	public ResponseEntity<byte[]> pageRotation(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file to be converted to a PDF/A file", required = true) MultipartFile inputFile)
			throws IOException, InterruptedException {
		return null;
	}
}
