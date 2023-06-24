package stirling.software.SPDF.controller.api.security;

import java.awt.Color;
import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;
import org.apache.pdfbox.util.Matrix;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.cybozu.labs.langdetect.Detector;
import com.cybozu.labs.langdetect.DetectorFactory;
import com.cybozu.labs.langdetect.LangDetectException;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import stirling.software.SPDF.utils.WebResponseUtils;
import org.springframework.core.io.ClassPathResource;
import org.apache.commons.io.IOUtils;

import java.io.InputStream;
import java.io.FileOutputStream;
import java.io.File;

@RestController
public class WatermarkController {

    @PostMapping(consumes = "multipart/form-data", value = "/add-watermark")
    @Operation(summary = "Add watermark to a PDF file",
            description = "This endpoint adds a watermark to a given PDF file. Users can specify the watermark text, font size, rotation, opacity, width spacer, and height spacer. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> addWatermark(
            @RequestPart(required = true, value = "fileInput")
            @Parameter(description = "The input PDF file to add a watermark")
                    MultipartFile pdfFile,
            @RequestParam("watermarkText")
            @Parameter(description = "The watermark text to add to the PDF file")
                    String watermarkText,
            @RequestParam(defaultValue = "30", name = "fontSize")
            @Parameter(description = "The font size of the watermark text", example = "30")
                    float fontSize,
            @RequestParam(defaultValue = "0", name = "rotation")
            @Parameter(description = "The rotation of the watermark text in degrees", example = "0")
                    float rotation,
            @RequestParam(defaultValue = "0.5", name = "opacity")
            @Parameter(description = "The opacity of the watermark text (0.0 - 1.0)", example = "0.5")
                    float opacity,
            @RequestParam(defaultValue = "50", name = "widthSpacer")
            @Parameter(description = "The width spacer between watermark texts", example = "50")
                    int widthSpacer,
            @RequestParam(defaultValue = "50", name = "heightSpacer")
            @Parameter(description = "The height spacer between watermark texts", example = "50")
                    int heightSpacer) throws IOException, Exception {

        // Load the input PDF
        PDDocument document = PDDocument.load(pdfFile.getInputStream());

        // Create a page in the document
        for (PDPage page : document.getPages()) {

            // Get the page's content stream
            PDPageContentStream contentStream = new PDPageContentStream(document, page, PDPageContentStream.AppendMode.APPEND, true);

            // Set transparency
            PDExtendedGraphicsState graphicsState = new PDExtendedGraphicsState();
            graphicsState.setNonStrokingAlphaConstant(opacity);
            contentStream.setGraphicsStateParameters(graphicsState);

            DetectorFactory.loadProfile("profiles");
            
            Detector detector = DetectorFactory.create();
            detector.append(watermarkText);
            String lang = detector.detect();

            System.out.println("Detected lang" + lang);
            // Set font of watermark
         // Load NotoSans-Regular font from resources
            String resourceDir = "";
            PDFont font = PDType1Font.HELVETICA_BOLD;
            switch (lang) {
                case "ar":
                    resourceDir = "src/main/resources/static/fonts/NotoSansArabic-Regular.ttf";
                    break;
                case "ja":
                    resourceDir = "src/main/resources/static/fonts/NotoSansJP-Regular.otf";
                    break;
                case "ko":
                    resourceDir = "src/main/resources/static/fonts/NotoSansKR-Regular.otf";
                    break;
                case "zh-cn":
                    resourceDir = "src/main/resources/static/fonts/NotoSansSC-Regular.otf";
                    break;
                default:
                    font = PDType1Font.HELVETICA_BOLD;
            }

            if(!resourceDir.equals("")) {
	            ClassPathResource classPathResource = new ClassPathResource("static/fonts/NotoSans-Regular.ttf");
	            File tempFile = File.createTempFile("NotoSans-Regular", ".ttf");
	            try (InputStream is = classPathResource.getInputStream(); FileOutputStream os = new FileOutputStream(tempFile)) {
	                IOUtils.copy(is, os);
	            }
	            
	            font = PDType0Font.load(document, tempFile);
            }
            contentStream.beginText();
            contentStream.setFont(font, fontSize);
            contentStream.setNonStrokingColor(Color.LIGHT_GRAY);

            // Set size and location of watermark
            float pageWidth = page.getMediaBox().getWidth();
            float pageHeight = page.getMediaBox().getHeight();
            float watermarkWidth = widthSpacer + font.getStringWidth(watermarkText) * fontSize / 1000;
            float watermarkHeight = heightSpacer + fontSize;
            int watermarkRows = (int) (pageHeight / watermarkHeight + 1);
            int watermarkCols = (int) (pageWidth / watermarkWidth + 1);

            // Add the watermark text
            for (int i = 0; i < watermarkRows; i++) {
                for (int j = 0; j < watermarkCols; j++) {
                    contentStream.setTextMatrix(Matrix.getRotateInstance((float) Math.toRadians(rotation), j * watermarkWidth, i * watermarkHeight));
                    contentStream.showTextWithPositioning(new Object[] { watermarkText });
                }
            }

            contentStream.endText();

            // Close the content stream
            contentStream.close();
        }
        return WebResponseUtils.pdfDocToWebResponse(document, pdfFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_watermarked.pdf");
    }

}
