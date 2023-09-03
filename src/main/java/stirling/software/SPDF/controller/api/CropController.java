package stirling.software.SPDF.controller.api;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;


import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.utils.WebResponseUtils;
import org.apache.commons.io.IOUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;
import org.apache.pdfbox.util.Matrix;
import org.apache.pdfbox.pdmodel.graphics.color.PDColorSpace;
import org.apache.pdfbox.pdmodel.graphics.color.PDICCBased;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.graphics.optionalcontent.PDOptionalContentGroup;
import org.apache.pdfbox.pdmodel.graphics.optionalcontent.PDOptionalContentProperties;
import stirling.software.SPDF.utils.WebResponseUtils;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.multipdf.LayerUtility;

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
			@Parameter(description = "The height of the crop area", required = true, schema = @Schema(type = "number")) @RequestParam("height") float height)
			throws IOException {




PDDocument sourceDocument = PDDocument.load(new ByteArrayInputStream(file.getBytes()));

PDDocument newDocument = new PDDocument();

int totalPages = sourceDocument.getNumberOfPages();

LayerUtility layerUtility = new LayerUtility(newDocument);

for (int i = 0; i < totalPages; i++) {
    PDPage sourcePage = sourceDocument.getPage(i);
    
    // Create a new page with the size of the source page
    PDPage newPage = new PDPage(sourcePage.getMediaBox());
    newDocument.addPage(newPage);
    PDPageContentStream contentStream = new PDPageContentStream(newDocument, newPage);

    // Import the source page as a form XObject
    PDFormXObject formXObject = layerUtility.importPageAsForm(sourceDocument, i);

    contentStream.saveGraphicsState();
    
    // Define the crop area
    contentStream.addRect(x, y, width, height);
    contentStream.clip();

    // Draw the entire formXObject
    contentStream.drawForm(formXObject);

    contentStream.restoreGraphicsState();

    contentStream.close();
    
    // Now, set the new page's media box to the cropped size
    newPage.setMediaBox(new PDRectangle(x, y, width, height));
}

ByteArrayOutputStream baos = new ByteArrayOutputStream();
newDocument.save(baos);
newDocument.close();
sourceDocument.close();

byte[] pdfContent = baos.toByteArray();
return WebResponseUtils.bytesToWebResponse(pdfContent, file.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_cropped.pdf");
	}

}
