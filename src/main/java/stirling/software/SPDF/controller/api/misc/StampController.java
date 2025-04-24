package stirling.software.SPDF.controller.api.misc;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.List;

import javax.imageio.ImageIO;

import org.apache.commons.io.IOUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
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

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.misc.AddStampRequest;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
@RequiredArgsConstructor
public class StampController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(consumes = "multipart/form-data", value = "/add-stamp")
    @Operation(
            summary = "Add stamp to a PDF file",
            description =
                    "This endpoint adds a stamp to a given PDF file. Users can specify the stamp"
                            + " type (text or image), rotation, opacity, width spacer, and height"
                            + " spacer. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> addStamp(@ModelAttribute AddStampRequest request)
            throws IOException, Exception {
        MultipartFile pdfFile = request.getFileInput();
        String stampType = request.getStampType();
        String stampText = request.getStampText();
        MultipartFile stampImage = request.getStampImage();
        String alphabet = request.getAlphabet();
        float fontSize = request.getFontSize();
        float rotation = request.getRotation();
        float opacity = request.getOpacity();
        int position = request.getPosition(); // Updated to use 1-9 positioning logic
        float overrideX = request.getOverrideX(); // New field for X override
        float overrideY = request.getOverrideY(); // New field for Y override

        String customColor = request.getCustomColor();
        float marginFactor;

        switch (request.getCustomMargin().toLowerCase()) {
            case "small":
                marginFactor = 0.02f;
                break;
            case "medium":
                marginFactor = 0.035f;
                break;
            case "large":
                marginFactor = 0.05f;
                break;
            case "x-large":
                marginFactor = 0.075f;
                break;
            default:
                marginFactor = 0.035f;
                break;
        }

        // Load the input PDF
        PDDocument document = pdfDocumentFactory.load(pdfFile);

        List<Integer> pageNumbers = request.getPageNumbersList(document, true);

        for (int pageIndex : pageNumbers) {
            int zeroBasedIndex = pageIndex - 1;
            if (zeroBasedIndex >= 0 && zeroBasedIndex < document.getNumberOfPages()) {
                PDPage page = document.getPage(zeroBasedIndex);
                PDRectangle pageSize = page.getMediaBox();
                float margin = marginFactor * (pageSize.getWidth() + pageSize.getHeight()) / 2;

                PDPageContentStream contentStream =
                        new PDPageContentStream(
                                document, page, PDPageContentStream.AppendMode.APPEND, true, true);

                PDExtendedGraphicsState graphicsState = new PDExtendedGraphicsState();
                graphicsState.setNonStrokingAlphaConstant(opacity);
                contentStream.setGraphicsStateParameters(graphicsState);

                if ("text".equalsIgnoreCase(stampType)) {
                    addTextStamp(
                            contentStream,
                            stampText,
                            document,
                            page,
                            rotation,
                            position,
                            fontSize,
                            alphabet,
                            overrideX,
                            overrideY,
                            margin,
                            customColor);
                } else if ("image".equalsIgnoreCase(stampType)) {
                    addImageStamp(
                            contentStream,
                            stampImage,
                            document,
                            page,
                            rotation,
                            position,
                            fontSize,
                            overrideX,
                            overrideY,
                            margin);
                }

                contentStream.close();
            }
        }
        return WebResponseUtils.pdfDocToWebResponse(
                document,
                Filenames.toSimpleFileName(pdfFile.getOriginalFilename())
                                .replaceFirst("[.][^.]+$", "")
                        + "_stamped.pdf");
    }

    private void addTextStamp(
            PDPageContentStream contentStream,
            String stampText,
            PDDocument document,
            PDPage page,
            float rotation,
            int position, // 1-9 positioning logic
            float fontSize,
            String alphabet,
            float overrideX, // X override
            float overrideY,
            float margin,
            String colorString) // Y override
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
                if (tempFile != null) {
                    Files.deleteIfExists(tempFile.toPath());
                }
            }
        }

        contentStream.setFont(font, fontSize);

        Color redactColor;
        try {
            if (!colorString.startsWith("#")) {
                colorString = "#" + colorString;
            }
            redactColor = Color.decode(colorString);
        } catch (NumberFormatException e) {

            redactColor = Color.LIGHT_GRAY;
        }

        contentStream.setNonStrokingColor(redactColor);

        PDRectangle pageSize = page.getMediaBox();
        float x, y;

        if (overrideX >= 0 && overrideY >= 0) {
            // Use override values if provided
            x = overrideX;
            y = overrideY;
        } else {
            x = calculatePositionX(pageSize, position, fontSize, font, fontSize, stampText, margin);
            y =
                    calculatePositionY(
                            pageSize, position, calculateTextCapHeight(font, fontSize), margin);
        }
        // Split the stampText into multiple lines
        String[] lines = stampText.split("\\\\n");

        // Calculate dynamic line height based on font ascent and descent
        float ascent = font.getFontDescriptor().getAscent();
        float descent = font.getFontDescriptor().getDescent();
        float lineHeight = ((ascent - descent) / 1000) * fontSize;

        contentStream.beginText();
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            // Set the text matrix for each line with rotation
            contentStream.setTextMatrix(
                    Matrix.getRotateInstance(Math.toRadians(rotation), x, y - (i * lineHeight)));
            contentStream.showText(line);
        }
        contentStream.endText();
    }

    private void addImageStamp(
            PDPageContentStream contentStream,
            MultipartFile stampImage,
            PDDocument document,
            PDPage page,
            float rotation,
            int position, // 1-9 positioning logic
            float fontSize,
            float overrideX,
            float overrideY,
            float margin)
            throws IOException {

        // Load the stamp image
        BufferedImage image = ImageIO.read(stampImage.getInputStream());

        // Compute width based on original aspect ratio
        float aspectRatio = (float) image.getWidth() / (float) image.getHeight();

        // Desired physical height (in PDF points)
        float desiredPhysicalHeight = fontSize;

        // Desired physical width based on the aspect ratio
        float desiredPhysicalWidth = desiredPhysicalHeight * aspectRatio;

        // Convert the BufferedImage to PDImageXObject
        PDImageXObject xobject = LosslessFactory.createFromImage(document, image);

        PDRectangle pageSize = page.getMediaBox();
        float x, y;

        if (overrideX >= 0 && overrideY >= 0) {
            // Use override values if provided
            x = overrideX;
            y = overrideY;
        } else {
            x = calculatePositionX(pageSize, position, desiredPhysicalWidth, null, 0, null, margin);
            y = calculatePositionY(pageSize, position, fontSize, margin);
        }

        contentStream.saveGraphicsState();
        contentStream.transform(Matrix.getTranslateInstance(x, y));
        contentStream.transform(Matrix.getRotateInstance(Math.toRadians(rotation), 0, 0));
        contentStream.drawImage(xobject, 0, 0, desiredPhysicalWidth, desiredPhysicalHeight);
        contentStream.restoreGraphicsState();
    }

    private float calculatePositionX(
            PDRectangle pageSize,
            int position,
            float contentWidth,
            PDFont font,
            float fontSize,
            String text,
            float margin)
            throws IOException {
        float actualWidth =
                (text != null) ? calculateTextWidth(text, font, fontSize) : contentWidth;
        switch (position % 3) {
            case 1: // Left
                return pageSize.getLowerLeftX() + margin;
            case 2: // Center
                return (pageSize.getWidth() - actualWidth) / 2;
            case 0: // Right
                return pageSize.getUpperRightX() - actualWidth - margin;
            default:
                return 0;
        }
    }

    private float calculatePositionY(
            PDRectangle pageSize, int position, float height, float margin) {
        switch ((position - 1) / 3) {
            case 0: // Top
                return pageSize.getUpperRightY() - height - margin;
            case 1: // Middle
                return (pageSize.getHeight() - height) / 2;
            case 2: // Bottom
                return pageSize.getLowerLeftY() + margin;
            default:
                return 0;
        }
    }

    private float calculateTextWidth(String text, PDFont font, float fontSize) throws IOException {
        return font.getStringWidth(text) / 1000 * fontSize;
    }

    private float calculateTextCapHeight(PDFont font, float fontSize) {
        return font.getFontDescriptor().getCapHeight() / 1000 * fontSize;
    }
}
