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
import io.swagger.v3.oas.annotations.media.Schema;

@RestController
@Tag(name = "Filter", description = "Filter APIs")
public class FilterController {

	@PostMapping(consumes = "multipart/form-data", value = "/filter-contains-text")
	@Operation(summary = "Checks if a PDF contains set text, returns true if does", description = "Input:PDF Output:Boolean Type:SISO")
	public ResponseEntity<byte[]> containsText(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file to be converted to a PDF/A file", required = true) MultipartFile inputFile,
			@Parameter(description = "The text to check for", required = true) String text,
			@Parameter(description = "The page number to check for text on accepts 'All', ranges like '1-4'", required = false) String pageNumber)
			throws IOException, InterruptedException {
		PDDocument pdfDocument = PDDocument.load(inputFile.getInputStream());
		if (PdfUtils.hasText(pdfDocument, pageNumber, text))
			return WebResponseUtils.pdfDocToWebResponse(pdfDocument, inputFile.getOriginalFilename());
		return null;
	}

	// TODO
	@PostMapping(consumes = "multipart/form-data", value = "/filter-contains-image")
	@Operation(summary = "Checks if a PDF contains an image", description = "Input:PDF Output:Boolean Type:SISO")
	public ResponseEntity<byte[]> containsImage(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file to be converted to a PDF/A file", required = true) MultipartFile inputFile,
			@Parameter(description = "The page number to check for image on accepts 'All', ranges like '1-4'", required = false) String pageNumber)
			throws IOException, InterruptedException {
		PDDocument pdfDocument = PDDocument.load(inputFile.getInputStream());
		if (PdfUtils.hasImages(pdfDocument, pageNumber))
			return WebResponseUtils.pdfDocToWebResponse(pdfDocument, inputFile.getOriginalFilename());
		return null;
	}

	@PostMapping(consumes = "multipart/form-data", value = "/filter-page-count")
	@Operation(summary = "Checks if a PDF is greater, less or equal to a setPageCount", description = "Input:PDF Output:Boolean Type:SISO")
	public ResponseEntity<byte[]> pageCount(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file", required = true) MultipartFile inputFile,
			@Parameter(description = "Page Count", required = true) String pageCount,
			@Parameter(description = "Comparison type", schema = @Schema(description = "The comparison type, accepts Greater, Equal, Less than", allowableValues = {
					"Greater", "Equal", "Less" })) String comparator)
			throws IOException, InterruptedException {
		// Load the PDF
		PDDocument document = PDDocument.load(inputFile.getInputStream());
		int actualPageCount = document.getNumberOfPages();

		boolean valid = false;
		// Perform the comparison
		switch (comparator) {
		case "Greater":
			valid = actualPageCount > Integer.parseInt(pageCount);
			break;
		case "Equal":
			valid = actualPageCount == Integer.parseInt(pageCount);
			break;
		case "Less":
			valid = actualPageCount < Integer.parseInt(pageCount);
			break;
		default:
			throw new IllegalArgumentException("Invalid comparator: " + comparator);
		}

		if (valid)
			return WebResponseUtils.multiPartFileToWebResponse(inputFile);
		return null;
	}

	@PostMapping(consumes = "multipart/form-data", value = "/filter-page-size")
	@Operation(summary = "Checks if a PDF is of a certain size", description = "Input:PDF Output:Boolean Type:SISO")
	public ResponseEntity<byte[]> pageSize(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file", required = true) MultipartFile inputFile,
			@Parameter(description = "Standard Page Size", required = true) String standardPageSize,
			@Parameter(description = "Comparison type", schema = @Schema(description = "The comparison type, accepts Greater, Equal, Less than", allowableValues = {
					"Greater", "Equal", "Less" })) String comparator)
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

		boolean valid = false;
		// Perform the comparison
		switch (comparator) {
		case "Greater":
			valid = actualArea > standardArea;
			break;
		case "Equal":
			valid = actualArea == standardArea;
			break;
		case "Less":
			valid = actualArea < standardArea;
			break;
		default:
			throw new IllegalArgumentException("Invalid comparator: " + comparator);
		}

		if (valid)
			return WebResponseUtils.multiPartFileToWebResponse(inputFile);
		return null;
	}

	@PostMapping(consumes = "multipart/form-data", value = "/filter-file-size")
	@Operation(summary = "Checks if a PDF is a set file size", description = "Input:PDF Output:Boolean Type:SISO")
	public ResponseEntity<byte[]> fileSize(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file", required = true) MultipartFile inputFile,
			@Parameter(description = "File Size", required = true) String fileSize,
			@Parameter(description = "Comparison type", schema = @Schema(description = "The comparison type, accepts Greater, Equal, Less than", allowableValues = {
					"Greater", "Equal", "Less" })) String comparator)
			throws IOException, InterruptedException {

		// Get the file size
		long actualFileSize = inputFile.getSize();

		boolean valid = false;
		// Perform the comparison
		switch (comparator) {
		case "Greater":
			valid = actualFileSize > Long.parseLong(fileSize);
			break;
		case "Equal":
			valid = actualFileSize == Long.parseLong(fileSize);
			break;
		case "Less":
			valid = actualFileSize < Long.parseLong(fileSize);
			break;
		default:
			throw new IllegalArgumentException("Invalid comparator: " + comparator);
		}

		if (valid)
			return WebResponseUtils.multiPartFileToWebResponse(inputFile);
		return null;
	}

	@PostMapping(consumes = "multipart/form-data", value = "/filter-page-rotation")
	@Operation(summary = "Checks if a PDF is of a certain rotation", description = "Input:PDF Output:Boolean Type:SISO")
	public ResponseEntity<byte[]> pageRotation(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file", required = true) MultipartFile inputFile,
			@Parameter(description = "Rotation in degrees", required = true) int rotation,
			@Parameter(description = "Comparison type", schema = @Schema(description = "The comparison type, accepts Greater, Equal, Less than", allowableValues = {
					"Greater", "Equal", "Less" })) String comparator)
			throws IOException, InterruptedException {

		// Load the PDF
		PDDocument document = PDDocument.load(inputFile.getInputStream());

		// Get the rotation of the first page
		PDPage firstPage = document.getPage(0);
		int actualRotation = firstPage.getRotation();
		boolean valid = false;
		// Perform the comparison
		switch (comparator) {
		case "Greater":
			valid = actualRotation > rotation;
			break;
		case "Equal":
			valid = actualRotation == rotation;
			break;
		case "Less":
			valid = actualRotation < rotation;
			break;
		default:
			throw new IllegalArgumentException("Invalid comparator: " + comparator);
		}

		if (valid)
			return WebResponseUtils.multiPartFileToWebResponse(inputFile);
		return null;

	}

}
