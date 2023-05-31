package stirling.software.SPDF.controller.api.other;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import stirling.software.SPDF.utils.PdfUtils;

@RestController
public class MultiPageLayoutController {

	private static final Logger logger = LoggerFactory.getLogger(MultiPageLayoutController.class);

	@PostMapping(value = "/multi-page-layout", consumes = "multipart/form-data")
	@Operation(summary = "Merge multiple pages of a PDF document into a single page", description = "This operation takes an input PDF file and the number of pages to merge into a single sheet in the output PDF file.")
	public ResponseEntity<byte[]> mergeMultiplePagesIntoOne(
			@Parameter(description = "The input PDF file", required = true) @RequestParam("fileInput") MultipartFile file,
			@Parameter(description = "The number of pages to fit onto a single sheet in the output PDF. Acceptable values are 2, 3, 4, 9, 16.", required = true, schema = @Schema(type = "integer", allowableValues = {
					"2", "3", "4", "9", "16" })) @RequestParam("pagesPerSheet") int pagesPerSheet)
			throws IOException {

		if (pagesPerSheet != 2 && pagesPerSheet != 3
				&& pagesPerSheet != (int) Math.sqrt(pagesPerSheet) * Math.sqrt(pagesPerSheet)) {
			throw new IllegalArgumentException("pagesPerSheet must be 2, 3 or a perfect square");
		}

		int cols = pagesPerSheet == 2 || pagesPerSheet == 3 ? pagesPerSheet : (int) Math.sqrt(pagesPerSheet);
		int rows = pagesPerSheet == 2 || pagesPerSheet == 3 ? 1 : (int) Math.sqrt(pagesPerSheet);

		byte[] bytes = file.getBytes();
		PdfReader reader = new PdfReader(new ByteArrayInputStream(bytes));
		PdfDocument pdfDoc = new PdfDocument(reader);

		ByteArrayOutputStream baos = new ByteArrayOutputStream();
		PdfWriter writer = new PdfWriter(baos);
		PdfDocument outputPdf = new PdfDocument(writer);
		PageSize pageSize = new PageSize(PageSize.A4.rotate());

		int totalPages = pdfDoc.getNumberOfPages();
		float cellWidth = pageSize.getWidth() / cols;
		float cellHeight = pageSize.getHeight() / rows;

		for (int i = 1; i <= totalPages; i += pagesPerSheet) {
			PdfPage page = outputPdf.addNewPage(pageSize);
			PdfCanvas pdfCanvas = new PdfCanvas(page);

			for (int row = 0; row < rows; row++) {
				for (int col = 0; col < cols; col++) {
					int index = i + row * cols + col;
					if (index <= totalPages) {
						// Get the page and calculate scaling factors
						Rectangle rect = pdfDoc.getPage(index).getPageSize();
						float scaleWidth = cellWidth / rect.getWidth();
						float scaleHeight = cellHeight / rect.getHeight();
						float scale = Math.min(scaleWidth, scaleHeight);

						PdfFormXObject formXObject = pdfDoc.getPage(index).copyAsFormXObject(outputPdf);
						float x = col * cellWidth + (cellWidth - rect.getWidth() * scale) / 2;
						float y = (rows - 1 - row) * cellHeight + (cellHeight - rect.getHeight() * scale) / 2;

						// Save the graphics state, apply the transformations, add the object, and then
						// restore the graphics state
						pdfCanvas.saveState();
						pdfCanvas.concatMatrix(scale, 0, 0, scale, x, y);
						pdfCanvas.addXObject(formXObject, 0, 0);
						pdfCanvas.restoreState();
					}
				}
			}
		}

		outputPdf.close();
		byte[] pdfContent = baos.toByteArray();
		pdfDoc.close();
		
		return PdfUtils.bytesToWebResponse(pdfContent, file.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_layoutChanged.pdf");
	}

}
