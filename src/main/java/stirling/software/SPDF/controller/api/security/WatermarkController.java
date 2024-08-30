package stirling.software.SPDF.controller.api.security;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;

import javax.imageio.ImageIO;

import org.apache.commons.io.IOUtils;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;
import org.apache.pdfbox.util.Matrix;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.security.AddWatermarkRequest;
import stirling.software.SPDF.utils.PdfUtils;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/security")
@Tag(name = "Security", description = "Security APIs")
public class WatermarkController {

    @PostMapping(consumes = "multipart/form-data", value = "/add-watermark")
    @Operation(
            summary = "Add watermark to a PDF file",
            description =
                    "This endpoint adds a watermark to a given PDF file. Users can specify the watermark type (text or image), rotation, opacity, width spacer, and height spacer. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> addWatermark(@ModelAttribute AddWatermarkRequest request)
            throws IOException, Exception {
        MultipartFile pdfFile = request.getFileInput();
        String watermarkType = request.getWatermarkType();
        String watermarkText = request.getWatermarkText();
        MultipartFile watermarkImage = request.getWatermarkImage();
        String alphabet = request.getAlphabet();
        float fontSize = request.getFontSize();
        float rotation = request.getRotation();
        float opacity = request.getOpacity();
        int widthSpacer = request.getWidthSpacer();
        int heightSpacer = request.getHeightSpacer();
        boolean convertPdfToImage = request.isConvertPDFToImage();

        // Load the input PDF
        PDDocument document = Loader.loadPDF(pdfFile.getBytes());

        // Create a page in the document
        for (PDPage page : document.getPages()) {

            // Get the page's content stream
            PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true);

            // Set transparency
            PDExtendedGraphicsState graphicsState = new PDExtendedGraphicsState();
            graphicsState.setNonStrokingAlphaConstant(opacity);
            contentStream.setGraphicsStateParameters(graphicsState);

            if ("text".equalsIgnoreCase(watermarkType)) {
                addTextWatermark(
                        contentStream,
                        watermarkText,
                        document,
                        page,
                        rotation,
                        widthSpacer,
                        heightSpacer,
                        fontSize,
                        alphabet);
            } else if ("image".equalsIgnoreCase(watermarkType)) {
                addImageWatermark(
                        contentStream,
                        watermarkImage,
                        document,
                        page,
                        rotation,
                        widthSpacer,
                        heightSpacer,
                        fontSize);
            }

            // Close the content stream
            contentStream.close();
        }

        if (convertPdfToImage) {
            PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document);
            document.close();
            document = convertedPdf;
        }

        return WebResponseUtils.pdfDocToWebResponse(
                document,
                Filenames.toSimpleFileName(pdfFile.getOriginalFilename())
                                .replaceFirst("[.][^.]+$", "")
                        + "_watermarked.pdf");
    }

    private void addTextWatermark(
            PDPageContentStream contentStream,
            String watermarkText,
            PDDocument document,
            PDPage page,
            float rotation,
            int widthSpacer,
            int heightSpacer,
            float fontSize,
            String alphabet)
            throws IOException {
        String resourceDir = "";
        PDFont font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
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

        if (!"".equals(resourceDir)) {
            ClassPathResource classPathResource = new ClassPathResource(resourceDir);
            String fileExtension = resourceDir.substring(resourceDir.lastIndexOf("."));
            File tempFile = Files.createTempFile("NotoSansFont", fileExtension).toFile();
            try (InputStream is = classPathResource.getInputStream();
                    FileOutputStream os = new FileOutputStream(tempFile)) {
                IOUtils.copy(is, os);
                font = PDType0Font.load(document, tempFile);
            } finally {
                if (tempFile != null) Files.deleteIfExists(tempFile.toPath());
            }
        }

        contentStream.setFont(font, fontSize);
        contentStream.setNonStrokingColor(Color.LIGHT_GRAY);

        String[] textLines = watermarkText.split("\\\\n");
        float maxLineWidth = 0;

        for (int i = 0; i < textLines.length; ++i) {
            maxLineWidth = Math.max(maxLineWidth, font.getStringWidth(textLines[i]));
        }

        // Set size and location of text watermark
        float watermarkWidth = widthSpacer + maxLineWidth * fontSize / 1000;
        float watermarkHeight = heightSpacer + fontSize * textLines.length;
        float pageWidth = page.getMediaBox().getWidth();
        float pageHeight = page.getMediaBox().getHeight();
        int watermarkRows = (int) (pageHeight / watermarkHeight + 1);
        int watermarkCols = (int) (pageWidth / watermarkWidth + 1);

        // Add the text watermark
        for (int i = 0; i < watermarkRows; i++) {
            for (int j = 0; j < watermarkCols; j++) {
                contentStream.beginText();
                contentStream.setTextMatrix(
                        Matrix.getRotateInstance(
                                (float) Math.toRadians(rotation),
                                j * watermarkWidth,
                                i * watermarkHeight));

                for (int k = 0; k < textLines.length; ++k) {
                    contentStream.showText(textLines[k]);
                    contentStream.newLineAtOffset(0, -fontSize);
                }

                contentStream.endText();
            }
        }
    }

    private void addImageWatermark(
            PDPageContentStream contentStream,
            MultipartFile watermarkImage,
            PDDocument document,
            PDPage page,
            float rotation,
            int widthSpacer,
            int heightSpacer,
            float fontSize)
            throws IOException {

        // Load the watermark image
        BufferedImage image = ImageIO.read(watermarkImage.getInputStream());

        // Compute width based on original aspect ratio
        float aspectRatio = (float) image.getWidth() / (float) image.getHeight();

        // Desired physical height (in PDF points)
        float desiredPhysicalHeight = fontSize;

        // Desired physical width based on the aspect ratio
        float desiredPhysicalWidth = desiredPhysicalHeight * aspectRatio;

        // Convert the BufferedImage to PDImageXObject
        PDImageXObject xobject = LosslessFactory.createFromImage(document, image);

        // Calculate the number of rows and columns for watermarks
        float pageWidth = page.getMediaBox().getWidth();
        float pageHeight = page.getMediaBox().getHeight();
        int watermarkRows =
                (int) ((pageHeight + heightSpacer) / (desiredPhysicalHeight + heightSpacer));
        int watermarkCols =
                (int) ((pageWidth + widthSpacer) / (desiredPhysicalWidth + widthSpacer));

        for (int i = 0; i < watermarkRows; i++) {
            for (int j = 0; j < watermarkCols; j++) {
                float x = j * (desiredPhysicalWidth + widthSpacer);
                float y = i * (desiredPhysicalHeight + heightSpacer);

                // Save the graphics state
                contentStream.saveGraphicsState();

                // Create rotation matrix and rotate
                contentStream.transform(
                        Matrix.getTranslateInstance(
                                x + desiredPhysicalWidth / 2, y + desiredPhysicalHeight / 2));
                contentStream.transform(Matrix.getRotateInstance(Math.toRadians(rotation), 0, 0));
                contentStream.transform(
                        Matrix.getTranslateInstance(
                                -desiredPhysicalWidth / 2, -desiredPhysicalHeight / 2));

                // Draw the image and restore the graphics state
                contentStream.drawImage(xobject, 0, 0, desiredPhysicalWidth, desiredPhysicalHeight);
                contentStream.restoreGraphicsState();
            }
        }
    }
}
