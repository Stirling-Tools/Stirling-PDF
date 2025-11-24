package stirling.software.SPDF.controller.api.misc;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.beans.PropertyEditorSupport;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
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
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.misc.AddStampRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@RequiredArgsConstructor
public class StampController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    /**
     * Initialize data binder for multipart file uploads. This method registers a custom editor for
     * MultipartFile to handle file uploads. It sets the MultipartFile to null if the uploaded file
     * is empty. This is necessary to avoid binding errors when the file is not present.
     */
    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.registerCustomEditor(
                MultipartFile.class,
                new PropertyEditorSupport() {
                    @Override
                    public void setAsText(String text) throws IllegalArgumentException {
                        setValue(null);
                    }
                });
    }

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/add-stamp")
    @StandardPdfResponse
    @Operation(
            summary = "Add stamp to a PDF file",
            description =
                    "This endpoint adds a stamp to a given PDF file. Users can specify the stamp"
                            + " type (text or image), rotation, opacity, width spacer, and height"
                            + " spacer. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> addStamp(@ModelAttribute AddStampRequest request)
            throws IOException, Exception {
        MultipartFile pdfFile = request.getFileInput();
        String pdfFileName = pdfFile.getOriginalFilename();
        if (pdfFileName.contains("..") || pdfFileName.startsWith("/")) {
            throw new IllegalArgumentException("Invalid PDF file path");
        }

        String stampType = request.getStampType();
        String stampText = request.getStampText();
        MultipartFile stampImage = request.getStampImage();
        if ("image".equalsIgnoreCase(stampType)) {
            if (stampImage == null) {
                throw new IllegalArgumentException(
                        "Stamp image file must be provided when stamp type is 'image'");
            }
            String stampImageName = stampImage.getOriginalFilename();
            if (stampImageName == null
                    || stampImageName.contains("..")
                    || stampImageName.startsWith("/")) {
                throw new IllegalArgumentException("Invalid stamp image file path");
            }
        }
        String alphabet = request.getAlphabet();
        float fontSize = request.getFontSize();
        float rotation = request.getRotation();
        float opacity = request.getOpacity();
        int position = request.getPosition(); // Updated to use 1-9 positioning logic
        float overrideX = request.getOverrideX(); // New field for X override
        float overrideY = request.getOverrideY(); // New field for Y override

        String customColor = request.getCustomColor();
        float marginFactor =
                switch (request.getCustomMargin().toLowerCase()) {
                    case "small" -> 0.02f;
                    case "medium" -> 0.035f;
                    case "large" -> 0.05f;
                    case "x-large" -> 0.075f;
                    default -> 0.035f;
                };

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
        // Return the stamped PDF as a response
        return WebResponseUtils.pdfDocToWebResponse(
                document,
                GeneralUtils.generateFilename(pdfFile.getOriginalFilename(), "_stamped.pdf"));
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
        String resourceDir;
        PDFont font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        resourceDir =
                switch (alphabet) {
                    case "arabic" -> "static/fonts/NotoSansArabic-Regular.ttf";
                    case "japanese" -> "static/fonts/NotoSansJP-Regular.ttf";
                    case "korean" -> "static/fonts/NotoSansKR-Regular.ttf";
                    case "chinese" -> "static/fonts/NotoSansSC-Regular.ttf";
                    case "thai" -> "static/fonts/NotoSansThai-Regular.ttf";
                    case "roman" -> "static/fonts/NotoSans-Regular.ttf";
                    default -> "static/fonts/NotoSans-Regular.ttf";
                };

        ClassPathResource classPathResource = new ClassPathResource(resourceDir);
        String fileExtension = resourceDir.substring(resourceDir.lastIndexOf("."));

        // Use TempFile with try-with-resources for automatic cleanup
        try (TempFile tempFileWrapper = new TempFile(tempFileManager, fileExtension)) {
            File tempFile = tempFileWrapper.getFile();
            try (InputStream is = classPathResource.getInputStream();
                    FileOutputStream os = new FileOutputStream(tempFile)) {
                IOUtils.copy(is, os);
                font = PDType0Font.load(document, tempFile);
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
        // Split the stampText into multiple lines
        String[] lines =
                RegexPatternUtils.getInstance().getEscapedNewlinePattern().split(stampText);

        // Calculate dynamic line height based on font ascent and descent
        float ascent = font.getFontDescriptor().getAscent();
        float descent = font.getFontDescriptor().getDescent();
        float lineHeight = ((ascent - descent) / 1000) * fontSize;

        // Compute a single pivot for the entire text block to avoid line-by-line wobble
        float capHeight = calculateTextCapHeight(font, fontSize);
        float blockHeight = Math.max(lineHeight, lineHeight * Math.max(1, lines.length));
        float maxWidth = 0f;
        for (String ln : lines) {
            maxWidth = Math.max(maxWidth, calculateTextWidth(ln, font, fontSize));
        }

        if (overrideX >= 0 && overrideY >= 0) {
            // Use override values if provided
            x = overrideX;
            y = overrideY;
        } else {
            // Base positioning on the true multi-line block size
            x = calculatePositionX(pageSize, position, maxWidth, null, 0, null, margin);
            y = calculatePositionY(pageSize, position, blockHeight, margin);
        }

        // After anchoring the block, draw from the top line downward
        float adjustedX = x;
        float adjustedY = y;
        float pivotX = adjustedX + maxWidth / 2f;
        float pivotY = adjustedY + blockHeight / 2f;

        // Apply rotation about the block center at the graphics state level
        contentStream.saveGraphicsState();
        contentStream.transform(Matrix.getTranslateInstance(pivotX, pivotY));
        contentStream.transform(Matrix.getRotateInstance(Math.toRadians(rotation), 0, 0));
        contentStream.transform(Matrix.getTranslateInstance(-pivotX, -pivotY));

        contentStream.beginText();
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            // Start from top line: yTop = adjustedY + blockHeight - capHeight
            float yLine = adjustedY + blockHeight - capHeight - (i * lineHeight);
            contentStream.setTextMatrix(Matrix.getTranslateInstance(adjustedX, yLine));
            contentStream.showText(line);
        }
        contentStream.endText();
        contentStream.restoreGraphicsState();
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
        // Rotate and scale about the center of the image
        float centerX = x + (desiredPhysicalWidth / 2f);
        float centerY = y + (desiredPhysicalHeight / 2f);
        contentStream.transform(Matrix.getTranslateInstance(centerX, centerY));
        contentStream.transform(Matrix.getRotateInstance(Math.toRadians(rotation), 0, 0));
        contentStream.drawImage(
                xobject,
                -desiredPhysicalWidth / 2f,
                -desiredPhysicalHeight / 2f,
                desiredPhysicalWidth,
                desiredPhysicalHeight);
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
        return switch (position % 3) {
            case 1: // Left
                yield pageSize.getLowerLeftX() + margin;
            case 2: // Center
                yield (pageSize.getWidth() - actualWidth) / 2;
            case 0: // Right
                yield pageSize.getUpperRightX() - actualWidth - margin;
            default:
                yield 0;
        };
    }

    private float calculatePositionY(
            PDRectangle pageSize, int position, float height, float margin) {
        return switch ((position - 1) / 3) {
            case 0: // Top
                yield pageSize.getUpperRightY() - height - margin;
            case 1: // Middle
                yield (pageSize.getHeight() - height) / 2;
            case 2: // Bottom
                yield pageSize.getLowerLeftY() + margin;
            default:
                yield 0;
        };
    }

    private float calculateTextWidth(String text, PDFont font, float fontSize) throws IOException {
        return font.getStringWidth(text) / 1000 * fontSize;
    }

    private float calculateTextCapHeight(PDFont font, float fontSize) {
        return font.getFontDescriptor().getCapHeight() / 1000 * fontSize;
    }
}
