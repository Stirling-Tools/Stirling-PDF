package stirling.software.SPDF.controller.api.filters;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
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
	public Boolean pageCount(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file", required = true) MultipartFile inputFile,
			@Parameter(description = "Page Count", required = true) String pageCount,
			@Parameter(description = "Comparison type, accepts Greater, Equal, Less than", required = false) String comparator)
			throws IOException, InterruptedException {
		// Load the PDF
		PDDocument document = PDDocument.load(inputFile.getInputStream());
		int actualPageCount = document.getNumberOfPages();

		// Perform the comparison
		switch (comparator) {
		case "Greater":
			return actualPageCount > Integer.parseInt(pageCount);
		case "Equal":
			return actualPageCount == Integer.parseInt(pageCount);
		case "Less":
			return actualPageCount < Integer.parseInt(pageCount);
		default:
			throw new IllegalArgumentException("Invalid comparator: " + comparator);
		}
	}

	@PostMapping(consumes = "multipart/form-data", value = "/page-size")
	@Operation(summary = "Checks if a PDF is of a certain size", description = "Input:PDF Output:Boolean Type:SISO")
	public Boolean pageSize(
		@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file", required = true) MultipartFile inputFile,
		@Parameter(description = "Standard Page Size", required = true) String standardPageSize,
		@Parameter(description = "Comparison type, accepts Greater, Equal, Less than", required = false) String comparator)
		throws IOException, InterruptedException {
		
		// Load the PDF
		PDDocument document = PDDocument.load(inputFile.getInputStream());

		PDPage firstPage = document.getPage(0);
		PDRectangle actualPageSize = firstPage.getMediaBox();

		// Calculate the area of the actual page size
		float actualArea = actualPageSize.getWidth() * actualPageSize.getHeight();

		// Get the standard size and calculate its area
		PDRectangle standardSize = PdfUtils.textToPageSize(standardPageSize);
		float standardArea = standardSize.getWidth() * standardSize.getHeight();

		// Perform the comparison
		switch (comparator) {
		case "Greater":
			return actualArea > standardArea;
		case "Equal":
			return actualArea == standardArea;
		case "Less":
			return actualArea < standardArea;
		default:
			throw new IllegalArgumentException("Invalid comparator: " + comparator);
		}
	}
	

	@PostMapping(consumes = "multipart/form-data", value = "/file-size")
	@Operation(summary = "Checks if a PDF is a set file size", description = "Input:PDF Output:Boolean Type:SISO")
	public Boolean fileSize(
		@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file", required = true) MultipartFile inputFile,
		@Parameter(description = "File Size", required = true) String fileSize,
		@Parameter(description = "Comparison type, accepts Greater, Equal, Less than", required = false) String comparator)
		throws IOException, InterruptedException {
		
		// Get the file size
		long actualFileSize = inputFile.getSize();

		// Perform the comparison
		switch (comparator) {
		case "Greater":
			return actualFileSize > Long.parseLong(fileSize);
		case "Equal":
			return actualFileSize == Long.parseLong(fileSize);
		case "Less":
			return actualFileSize < Long.parseLong(fileSize);
		default:
			throw new IllegalArgumentException("Invalid comparator: " + comparator);
		}
	}

	
	@PostMapping(consumes = "multipart/form-data", value = "/page-rotation")
	@Operation(summary = "Checks if a PDF is of a certain rotation", description = "Input:PDF Output:Boolean Type:SISO")
	public Boolean pageRotation(
		@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file", required = true) MultipartFile inputFile,
		@Parameter(description = "Rotation in degrees", required = true) int rotation,
		@Parameter(description = "Comparison type, accepts Greater, Equal, Less than", required = false) String comparator)
		throws IOException, InterruptedException {
		
		// Load the PDF
		PDDocument document = PDDocument.load(inputFile.getInputStream());

		// Get the rotation of the first page
		PDPage firstPage = document.getPage(0);
		int actualRotation = firstPage.getRotation();

		// Perform the comparison
		switch (comparator) {
		case "Greater":
			return actualRotation > rotation;
		case "Equal":
			return actualRotation == rotation;
		case "Less":
			return actualRotation < rotation;
		default:
			throw new IllegalArgumentException("Invalid comparator: " + comparator);
		}
	}

}
