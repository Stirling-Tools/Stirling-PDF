package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.utils.PDFToFile;

@RestController
@Tag(name = "Convert", description = "Convert APIs")
public class ConvertPDFToOffice {

	@PostMapping(consumes = "multipart/form-data", value = "/pdf-to-html")
	@Operation(summary = "Convert PDF to HTML", description = "This endpoint converts a PDF file to HTML format. Input:PDF Output:HTML Type:SISO")
	public ResponseEntity<byte[]> processPdfToHTML(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file to be converted to HTML format", required = true) MultipartFile inputFile)
			throws IOException, InterruptedException {
		PDFToFile pdfToFile = new PDFToFile();
		return pdfToFile.processPdfToOfficeFormat(inputFile, "html", "writer_pdf_import");
	}

	@PostMapping(consumes = "multipart/form-data", value = "/pdf-to-presentation")
	@Operation(summary = "Convert PDF to Presentation format", description = "This endpoint converts a given PDF file to a Presentation format. Input:PDF Output:PPT Type:SISO")
	public ResponseEntity<byte[]> processPdfToPresentation(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file") MultipartFile inputFile,
			@RequestParam("outputFormat") @Parameter(description = "The output Presentation format", schema = @Schema(allowableValues = {
					"ppt", "pptx", "odp" })) String outputFormat)
			throws IOException, InterruptedException {
		PDFToFile pdfToFile = new PDFToFile();
		return pdfToFile.processPdfToOfficeFormat(inputFile, outputFormat, "impress_pdf_import");
	}

	@PostMapping(consumes = "multipart/form-data", value = "/pdf-to-text")
	@Operation(summary = "Convert PDF to Text or RTF format", description = "This endpoint converts a given PDF file to Text or RTF format. Input:PDF Output:TXT Type:SISO")
	public ResponseEntity<byte[]> processPdfToRTForTXT(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file") MultipartFile inputFile,
			@RequestParam("outputFormat") @Parameter(description = "The output Text or RTF format", schema = @Schema(allowableValues = {
					"rtf", "txt:Text" })) String outputFormat)
			throws IOException, InterruptedException {
		PDFToFile pdfToFile = new PDFToFile();
		return pdfToFile.processPdfToOfficeFormat(inputFile, outputFormat, "writer_pdf_import");
	}

	@PostMapping(consumes = "multipart/form-data", value = "/pdf-to-word")
	@Operation(summary = "Convert PDF to Word document", description = "This endpoint converts a given PDF file to a Word document format. Input:PDF Output:WORD Type:SISO")
	public ResponseEntity<byte[]> processPdfToWord(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file") MultipartFile inputFile,
			@RequestParam("outputFormat") @Parameter(description = "The output Word document format", schema = @Schema(allowableValues = {
					"doc", "docx", "odt" })) String outputFormat)
			throws IOException, InterruptedException {
		PDFToFile pdfToFile = new PDFToFile();
		return pdfToFile.processPdfToOfficeFormat(inputFile, outputFormat, "writer_pdf_import");
	}

	@PostMapping(consumes = "multipart/form-data", value = "/pdf-to-xml")
	@Operation(summary = "Convert PDF to XML", description = "This endpoint converts a PDF file to an XML file. Input:PDF Output:XML Type:SISO")
	public ResponseEntity<byte[]> processPdfToXML(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file to be converted to an XML file", required = true) MultipartFile inputFile)
			throws IOException, InterruptedException {

		PDFToFile pdfToFile = new PDFToFile();
		return pdfToFile.processPdfToOfficeFormat(inputFile, "xml", "writer_pdf_import");
	}

}
