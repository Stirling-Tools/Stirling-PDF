package stirling.software.SPDF.controller.api;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
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
import com.itextpdf.kernel.pdf.canvas.parser.EventType;
import com.itextpdf.kernel.pdf.canvas.parser.PdfCanvasProcessor;
import com.itextpdf.kernel.pdf.canvas.parser.data.IEventData;
import com.itextpdf.kernel.pdf.canvas.parser.data.TextRenderInfo;
import com.itextpdf.kernel.pdf.canvas.parser.listener.IEventListener;
import com.itextpdf.kernel.pdf.xobject.PdfFormXObject;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@Tag(name = "General", description = "General APIs")
public class ScalePagesController {

	private static final Logger logger = LoggerFactory.getLogger(ScalePagesController.class);

	@PostMapping(value = "/scale-pages", consumes = "multipart/form-data")
	@Operation(summary = "Change the size of a PDF page/document", description = "This operation takes an input PDF file and the size to scale the pages to in the output PDF file. Input:PDF Output:PDF Type:SISO")
	public ResponseEntity<byte[]> scalePages(
			@Parameter(description = "The input PDF file", required = true) @RequestParam("fileInput") MultipartFile file,
			@Parameter(description = "The scale of pages in the output PDF. Acceptable values are A0-A10, B0-B9, LETTER, TABLOID, LEDGER, LEGAL, EXECUTIVE.", required = true, schema = @Schema(type = "String", allowableValues = {
					"A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "B0", "B1", "B2", "B3", "B4",
					"B5", "B6", "B7", "B8", "B9", "LETTER", "TABLOID", "LEDGER", "LEGAL",
					"EXECUTIVE" })) @RequestParam("pageSize") String targetPageSize,
			@Parameter(description = "The scale of the content on the pages of the output PDF. Acceptable values are floats.", required = true, schema = @Schema(type = "float")) @RequestParam("scaleFactor") float scaleFactor)
			throws IOException {

		Map<String, PageSize> sizeMap = new HashMap<>();
		// Add A0 - A10
		sizeMap.put("A0", PageSize.A0);
		sizeMap.put("A1", PageSize.A1);
		sizeMap.put("A2", PageSize.A2);
		sizeMap.put("A3", PageSize.A3);
		sizeMap.put("A4", PageSize.A4);
		sizeMap.put("A5", PageSize.A5);
		sizeMap.put("A6", PageSize.A6);
		sizeMap.put("A7", PageSize.A7);
		sizeMap.put("A8", PageSize.A8);
		sizeMap.put("A9", PageSize.A9);
		sizeMap.put("A10", PageSize.A10);
		// Add B0 - B9
		sizeMap.put("B0", PageSize.B0);
		sizeMap.put("B1", PageSize.B1);
		sizeMap.put("B2", PageSize.B2);
		sizeMap.put("B3", PageSize.B3);
		sizeMap.put("B4", PageSize.B4);
		sizeMap.put("B5", PageSize.B5);
		sizeMap.put("B6", PageSize.B6);
		sizeMap.put("B7", PageSize.B7);
		sizeMap.put("B8", PageSize.B8);
		sizeMap.put("B9", PageSize.B9);
		// Add other sizes
		sizeMap.put("LETTER", PageSize.LETTER);
		sizeMap.put("TABLOID", PageSize.TABLOID);
		sizeMap.put("LEDGER", PageSize.LEDGER);
		sizeMap.put("LEGAL", PageSize.LEGAL);
		sizeMap.put("EXECUTIVE", PageSize.EXECUTIVE);

		if (!sizeMap.containsKey(targetPageSize)) {
			throw new IllegalArgumentException(
					"Invalid pageSize. It must be one of the following: A0, A1, A2, A3, A4, A5, A6, A7, A8, A9, A10");
		}

		PageSize pageSize = sizeMap.get(targetPageSize);

		byte[] bytes = file.getBytes();
		PdfReader reader = new PdfReader(new ByteArrayInputStream(bytes));
		PdfDocument pdfDoc = new PdfDocument(reader);

		ByteArrayOutputStream baos = new ByteArrayOutputStream();
		PdfWriter writer = new PdfWriter(baos);
		PdfDocument outputPdf = new PdfDocument(writer);

		int totalPages = pdfDoc.getNumberOfPages();

		for (int i = 1; i <= totalPages; i++) {
			PdfPage page = outputPdf.addNewPage(pageSize);
			PdfCanvas pdfCanvas = new PdfCanvas(page);

			// Get the page and calculate scaling factors
			Rectangle rect = pdfDoc.getPage(i).getPageSize();
			float scaleWidth = pageSize.getWidth() / rect.getWidth();
			float scaleHeight = pageSize.getHeight() / rect.getHeight();
			float scale = Math.min(scaleWidth, scaleHeight) * scaleFactor;
			System.out.println("Scale: " + scale);

			PdfFormXObject formXObject = pdfDoc.getPage(i).copyAsFormXObject(outputPdf);
			float x = (pageSize.getWidth() - rect.getWidth() * scale) / 2; // Center Page
			float y = (pageSize.getHeight() - rect.getHeight() * scale) / 2;

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
		return WebResponseUtils.bytesToWebResponse(pdfContent,
				file.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_scaled.pdf");
	}

	//TODO
	@Hidden
	@PostMapping(value = "/auto-crop", consumes = "multipart/form-data")
	public ResponseEntity<byte[]> cropPdf(@RequestParam("fileInput") MultipartFile file) throws IOException {
		byte[] bytes = file.getBytes();
		PdfReader reader = new PdfReader(new ByteArrayInputStream(bytes));
		PdfDocument pdfDoc = new PdfDocument(reader);

		ByteArrayOutputStream baos = new ByteArrayOutputStream();
		PdfWriter writer = new PdfWriter(baos);
		PdfDocument outputPdf = new PdfDocument(writer);

		int totalPages = pdfDoc.getNumberOfPages();
		for (int i = 1; i <= totalPages; i++) {
			PdfPage page = pdfDoc.getPage(i);
			Rectangle originalMediaBox = page.getMediaBox();

			Rectangle contentBox = determineContentBox(page);

			// Make sure we don't go outside the original media box.
			Rectangle intersection = originalMediaBox.getIntersection(contentBox);
			page.setCropBox(intersection);

			// Copy page to the new document
			outputPdf.addPage(page.copyTo(outputPdf));
		}

		outputPdf.close();
		byte[] pdfContent = baos.toByteArray();
		pdfDoc.close();
		return ResponseEntity.ok()
				.header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\""
						+ file.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_cropped.pdf\"")
				.contentType(MediaType.APPLICATION_PDF).body(pdfContent);
	}

	private Rectangle determineContentBox(PdfPage page) {
		// Extract the text from the page and find the bounding box.
		TextBoundingRectangleFinder finder = new TextBoundingRectangleFinder();
		PdfCanvasProcessor processor = new PdfCanvasProcessor(finder);
		processor.processPageContent(page);
		return finder.getBoundingBox();
	}

	private static class TextBoundingRectangleFinder implements IEventListener {
		private List<Rectangle> allTextBoxes = new ArrayList<>();

		public Rectangle getBoundingBox() {
			// Sort the text boxes based on their vertical position
			allTextBoxes.sort(Comparator.comparingDouble(Rectangle::getTop));

			// Consider a box an outlier if its top is more than 1.5 times the IQR above the
			// third quartile.
			int q1Index = allTextBoxes.size() / 4;
			int q3Index = 3 * allTextBoxes.size() / 4;
			double iqr = allTextBoxes.get(q3Index).getTop() - allTextBoxes.get(q1Index).getTop();
			double threshold = allTextBoxes.get(q3Index).getTop() + 1.5 * iqr;

			// Initialize boundingBox to the first non-outlier box
			int i = 0;
			while (i < allTextBoxes.size() && allTextBoxes.get(i).getTop() > threshold) {
				i++;
			}
			if (i == allTextBoxes.size()) {
				// If all boxes are outliers, just return the first one
				return allTextBoxes.get(0);
			}
			Rectangle boundingBox = allTextBoxes.get(i);

			// Extend the bounding box to include all non-outlier boxes
			for (; i < allTextBoxes.size(); i++) {
				Rectangle textBoundingBox = allTextBoxes.get(i);
				if (textBoundingBox.getTop() > threshold) {
					// This box is an outlier, skip it
					continue;
				}
				float left = Math.min(boundingBox.getLeft(), textBoundingBox.getLeft());
				float bottom = Math.min(boundingBox.getBottom(), textBoundingBox.getBottom());
				float right = Math.max(boundingBox.getRight(), textBoundingBox.getRight());
				float top = Math.max(boundingBox.getTop(), textBoundingBox.getTop());

				// Add a small padding around the bounding box
				float padding = 10;
				boundingBox = new Rectangle(left - padding, bottom - padding, right - left + 2 * padding,
						top - bottom + 2 * padding);
			}
			return boundingBox;
		}

		@Override
		public void eventOccurred(IEventData data, EventType type) {
			if (type == EventType.RENDER_TEXT) {
				TextRenderInfo renderInfo = (TextRenderInfo) data;
				allTextBoxes.add(renderInfo.getBaseline().getBoundingRectangle());
			}
		}

		@Override
		public Set<EventType> getSupportedEvents() {
			return Collections.singleton(EventType.RENDER_TEXT);
		}
	}

}
