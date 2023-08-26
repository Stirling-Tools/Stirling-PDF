package stirling.software.SPDF.controller.api.security;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

import javax.imageio.ImageIO;

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
import org.springframework.core.io.ClassPathResource;
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
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@Tag(name = "Security", description = "Security APIs")
public class WatermarkController {

	@PostMapping(consumes = "multipart/form-data", value = "/add-watermark")
	@Operation(summary = "Add watermark to a PDF file", description = "This endpoint adds a watermark to a given PDF file. Users can specify the watermark type (text or image), rotation, opacity, width spacer, and height spacer. Input:PDF Output:PDF Type:SISO")
	public ResponseEntity<byte[]> addWatermark(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file to add a watermark") MultipartFile pdfFile,
			@RequestParam(required = true) @Parameter(description = "The watermark type (text or image)") String watermarkType,
			@RequestParam(required = false) @Parameter(description = "The watermark text") String watermarkText,
			@RequestPart(required = false) @Parameter(description = "The watermark image") MultipartFile watermarkImage,
			
			@RequestParam(defaultValue = "roman", name = "alphabet") @Parameter(description = "The selected alphabet", 
            schema = @Schema(type = "string", 
                             allowableValues = {"roman","arabic","japanese","korean","chinese"}, 
                             defaultValue = "roman")) String alphabet,
			@RequestParam(defaultValue = "30", name = "fontSize") @Parameter(description = "The font size of the watermark text", example = "30") float fontSize,
			@RequestParam(defaultValue = "0", name = "rotation") @Parameter(description = "The rotation of the watermark in degrees", example = "0") float rotation,
			@RequestParam(defaultValue = "0.5", name = "opacity") @Parameter(description = "The opacity of the watermark (0.0 - 1.0)", example = "0.5") float opacity,
			@RequestParam(defaultValue = "50", name = "widthSpacer") @Parameter(description = "The width spacer between watermark elements", example = "50") int widthSpacer,
			@RequestParam(defaultValue = "50", name = "heightSpacer") @Parameter(description = "The height spacer between watermark elements", example = "50") int heightSpacer)
			throws IOException, Exception {

		// Load the input PDF
		PDDocument document = PDDocument.load(pdfFile.getInputStream());

		// Create a page in the document
		for (PDPage page : document.getPages()) {

			// Get the page's content stream
			PDPageContentStream contentStream = new PDPageContentStream(document, page,
					PDPageContentStream.AppendMode.APPEND, true);

			// Set transparency
			PDExtendedGraphicsState graphicsState = new PDExtendedGraphicsState();
			graphicsState.setNonStrokingAlphaConstant(opacity);
			contentStream.setGraphicsStateParameters(graphicsState);

			if (watermarkType.equalsIgnoreCase("text")) {
				addTextWatermark(contentStream, watermarkText, document, page, rotation, widthSpacer, heightSpacer,
						fontSize, alphabet);
			} else if (watermarkType.equalsIgnoreCase("image")) {
				addImageWatermark(contentStream, watermarkImage, document, page, rotation, widthSpacer, heightSpacer,
						fontSize);
			}

			// Close the content stream
			contentStream.close();
		}

		return WebResponseUtils.pdfDocToWebResponse(document,
				pdfFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_watermarked.pdf");
	}

	private void addTextWatermark(PDPageContentStream contentStream, String watermarkText, PDDocument document,
			PDPage page, float rotation, int widthSpacer, int heightSpacer, float fontSize, String alphabet) throws IOException {
		String resourceDir = "";
	    PDFont font = PDType1Font.HELVETICA_BOLD;
	    switch (alphabet) {
	        case "arabic":
	            resourceDir = "static/fonts/NotoSansArabic-Regular.ttf";
	            break;
	        case "japanese":
	            resourceDir = "static/fonts/Meiryo.ttf";
	            break;
	        case "korean":
	            resourceDir = "static/fonts/malgun.ttf";
	            break;
	        case "chinese":
	            resourceDir = "static/fonts/SimSun.ttf";
	            break;
	        case "roman":
	        default:
	            resourceDir = "static/fonts/NotoSans-Regular.ttf";
	            break;
	    }

        
        if(!resourceDir.equals("")) {
            ClassPathResource classPathResource = new ClassPathResource(resourceDir);
            String fileExtension = resourceDir.substring(resourceDir.lastIndexOf("."));
            File tempFile = File.createTempFile("NotoSansFont", fileExtension);
            try (InputStream is = classPathResource.getInputStream(); FileOutputStream os = new FileOutputStream(tempFile)) {
                IOUtils.copy(is, os);
            }
            
            font = PDType0Font.load(document, tempFile);
            tempFile.deleteOnExit();
        }
        
		contentStream.setFont(font, fontSize);
		contentStream.setNonStrokingColor(Color.LIGHT_GRAY);

		// Set size and location of text watermark
		float watermarkWidth = widthSpacer + font.getStringWidth(watermarkText) * fontSize / 1000;
		float watermarkHeight = heightSpacer + fontSize;
		float pageWidth = page.getMediaBox().getWidth();
		float pageHeight = page.getMediaBox().getHeight();
		int watermarkRows = (int) (pageHeight / watermarkHeight + 1);
		int watermarkCols = (int) (pageWidth / watermarkWidth + 1);

		// Add the text watermark
		for (int i = 0; i < watermarkRows; i++) {
			for (int j = 0; j < watermarkCols; j++) {
				contentStream.beginText();
				contentStream.setTextMatrix(Matrix.getRotateInstance((float) Math.toRadians(rotation),
						j * watermarkWidth, i * watermarkHeight));
				contentStream.showText(watermarkText);
				contentStream.endText();
			}
		}
	}

	private void addImageWatermark(PDPageContentStream contentStream, MultipartFile watermarkImage, PDDocument document, PDPage page, float rotation,
            int widthSpacer, int heightSpacer, float fontSize) throws IOException {

// Load the watermark image
BufferedImage image = ImageIO.read(watermarkImage.getInputStream());

// Compute width based on original aspect ratio
float aspectRatio = (float) image.getWidth() / (float) image.getHeight();

// Desired physical height (in PDF points)
float desiredPhysicalHeight = fontSize ;

// Desired physical width based on the aspect ratio
float desiredPhysicalWidth = desiredPhysicalHeight * aspectRatio;

// Convert the BufferedImage to PDImageXObject
PDImageXObject xobject = LosslessFactory.createFromImage(document, image);

// Calculate the number of rows and columns for watermarks
float pageWidth = page.getMediaBox().getWidth();
float pageHeight = page.getMediaBox().getHeight();
int watermarkRows = (int) ((pageHeight + heightSpacer) / (desiredPhysicalHeight + heightSpacer));
int watermarkCols = (int) ((pageWidth + widthSpacer) / (desiredPhysicalWidth + widthSpacer));

for (int i = 0; i < watermarkRows; i++) {
for (int j = 0; j < watermarkCols; j++) {
float x = j * (desiredPhysicalWidth + widthSpacer);
float y = i * (desiredPhysicalHeight + heightSpacer);

// Save the graphics state
contentStream.saveGraphicsState();

// Create rotation matrix and rotate
contentStream.transform(Matrix.getTranslateInstance(x + desiredPhysicalWidth / 2, y + desiredPhysicalHeight / 2));
contentStream.transform(Matrix.getRotateInstance(Math.toRadians(rotation), 0, 0));
contentStream.transform(Matrix.getTranslateInstance(-desiredPhysicalWidth / 2, -desiredPhysicalHeight / 2));

// Draw the image and restore the graphics state
contentStream.drawImage(xobject, 0, 0, desiredPhysicalWidth, desiredPhysicalHeight);
contentStream.restoreGraphicsState();
}

}

	}

}
