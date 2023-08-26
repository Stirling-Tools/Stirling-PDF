package stirling.software.SPDF.controller.api;

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
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfPage;
import com.itextpdf.kernel.pdf.PdfReader;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.kernel.pdf.canvas.PdfCanvas;
import com.itextpdf.kernel.pdf.xobject.PdfFormXObject;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@Tag(name = "General", description = "General APIs")
public class CropController {

    private static final Logger logger = LoggerFactory.getLogger(CropController.class);


	@PostMapping(value = "/crop", consumes = "multipart/form-data")
	@Operation(summary = "Crops a PDF document", description = "This operation takes an input PDF file and crops it according to the given coordinates. Input:PDF Output:PDF Type:SISO")
	public ResponseEntity<byte[]> cropPdf(
	        @Parameter(description = "The input PDF file", required = true) @RequestParam("fileInput") MultipartFile file,
	        @Parameter(description = "The x-coordinate of the top-left corner of the crop area", required = true, schema = @Schema(type = "number")) @RequestParam("x") float x,
	        @Parameter(description = "The y-coordinate of the top-left corner of the crop area", required = true, schema = @Schema(type = "number")) @RequestParam("y") float y,
	        @Parameter(description = "The width of the crop area", required = true, schema = @Schema(type = "number")) @RequestParam("width") float width,
	        @Parameter(description = "The height of the crop area", required = true, schema = @Schema(type = "number")) @RequestParam("height") float height) throws IOException {
	    byte[] bytes = file.getBytes();
	    System.out.println("x=" + x + ", " + "y=" + y + ", " + "width=" + width + ", " +"height=" + height  );
	    PdfReader reader = new PdfReader(new ByteArrayInputStream(bytes));
	    PdfDocument pdfDoc = new PdfDocument(reader);
	
	    ByteArrayOutputStream baos = new ByteArrayOutputStream();
	    PdfWriter writer = new PdfWriter(baos);
	    PdfDocument outputPdf = new PdfDocument(writer);
	
	    int totalPages = pdfDoc.getNumberOfPages();
	
	    for (int i = 1; i <= totalPages; i++) {
	        PdfPage page = outputPdf.addNewPage(new PageSize(width, height));
	        PdfCanvas pdfCanvas = new PdfCanvas(page);

	        PdfFormXObject formXObject = pdfDoc.getPage(i).copyAsFormXObject(outputPdf);

	        // Save the graphics state, apply the transformations, add the object, and then
	        // restore the graphics state
	        pdfCanvas.saveState();
	        pdfCanvas.rectangle(x, y, width, height);
	        pdfCanvas.clip();
	        pdfCanvas.addXObject(formXObject, -x, -y);
	        pdfCanvas.restoreState();
	    }
	

	    outputPdf.close();
		byte[] pdfContent = baos.toByteArray();
		pdfDoc.close();
		return WebResponseUtils.bytesToWebResponse(pdfContent,
				file.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_cropped.pdf");
	}

}
