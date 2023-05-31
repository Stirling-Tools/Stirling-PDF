package stirling.software.SPDF.controller.api.other;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfPage;
import com.itextpdf.kernel.pdf.PdfReader;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.kernel.pdf.canvas.PdfCanvas;
import com.itextpdf.kernel.pdf.xobject.PdfFormXObject;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;

@RestController
public class ScalePagesController {

	private static final Logger logger = LoggerFactory.getLogger(ScalePagesController.class);

	@PostMapping(value = "/scale-pages", consumes = "multipart/form-data")
	@Operation(summary = "Change the size of a PDF page/document", description = "This operation takes an input PDF file and the size to scale the pages to in the output PDF file.")
	public ResponseEntity<byte[]> mergeMultiplePagesIntoOne(
			@Parameter(description = "The input PDF file", required = true) @RequestParam("fileInput") MultipartFile file,
			@Parameter(description = "The scale of pages in the output PDF. Acceptable values are A4.", required = true, schema = @Schema(type = "String", allowableValues = { "A4" })) @RequestParam("pageSize") String targetPageSize,
            @Parameter(description = "The scale of the content on the pages of the output PDF. Acceptable values are floats.", required = true, schema = @Schema(type = "float")) @RequestParam("scaleFactor") float scaleFactor)
			throws IOException {

		if (!targetPageSize.equals("A4")) {
			throw new IllegalArgumentException("pageSize must be A4");
		}

		byte[] bytes = file.getBytes();
		PdfReader reader = new PdfReader(new ByteArrayInputStream(bytes));
		PdfDocument pdfDoc = new PdfDocument(reader);

		ByteArrayOutputStream baos = new ByteArrayOutputStream();
		PdfWriter writer = new PdfWriter(baos);
		PdfDocument outputPdf = new PdfDocument(writer);

		PageSize pageSize = new PageSize(PageSize.A4); // TODO: This (and all other PageSize.A4) need to be dynamically changed in response to targetPageSize

		int totalPages = pdfDoc.getNumberOfPages();

		for (int i = 1; i <= totalPages; i++) {
			PdfPage page = outputPdf.addNewPage(pageSize);
			PdfCanvas pdfCanvas = new PdfCanvas(page);

			// Get the page and calculate scaling factors
			Rectangle rect = pdfDoc.getPage(i).getPageSize();
			float scaleWidth = PageSize.A4.getWidth() / rect.getWidth();
			float scaleHeight = PageSize.A4.getHeight() / rect.getHeight();
			float scale = Math.min(scaleWidth, scaleHeight) * scaleFactor;
            System.out.println("Scale: " + scale);

			PdfFormXObject formXObject = pdfDoc.getPage(i).copyAsFormXObject(outputPdf);
			float x = (PageSize.A4.getWidth() - rect.getWidth() * scale) / 2; // Center Page
			float y = (PageSize.A4.getHeight() - rect.getHeight() * scale) / 2;

			// Save the graphics state, apply the transformations, add the object, and then
			// restore the graphics state
			pdfCanvas.saveState();
			pdfCanvas.concatMatrix(scale, 0, 0, scale, x, y);
			pdfCanvas.addXObject(formXObject, 0, 0);
			pdfCanvas.restoreState();
		}

		outputPdf.close();
		byte[] pdfContent = baos.toByteArray();
		pdfDoc.close();
		return ResponseEntity.ok()
				.header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + file.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_modified.pdf\"")
				.body(pdfContent);
	}
}
