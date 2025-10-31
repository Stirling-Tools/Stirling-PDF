package stirling.software.SPDF.controller.api.security;

import static stirling.software.common.util.RegexPatternUtils.getColorPattern;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.beans.PropertyEditorSupport;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;

import javax.imageio.ImageIO;

import org.apache.commons.io.IOUtils;
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
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.security.AddWatermarkRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.*;

@Slf4j
@RestController
@RequestMapping("/api/v1/security")
@Tag(name = "Security", description = "Security APIs")
@RequiredArgsConstructor
public class WatermarkController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

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

    /**
     * Validates watermark request parameters and enforces safety caps. Throws
     * IllegalArgumentException with descriptive messages for validation failures.
     */
    private void validateWatermarkRequest(AddWatermarkRequest request) {
        // Validate opacity bounds (0.0 - 1.0)
        float opacity = request.getOpacity();
        if (opacity < 0.0f || opacity > 1.0f) {
            log.error("Opacity must be between 0.0 and 1.0, but got: {}", opacity);
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.opacityOutOfRange", // TODO
                    "Opacity must be between 0.0 and 1.0, but got: {0}",
                    opacity);
        }

        // Validate rotation range: rotationMin <= rotationMax
        Float rotationMin = request.getRotationMin();
        Float rotationMax = request.getRotationMax();
        if (rotationMin != null && rotationMax != null && rotationMin > rotationMax) {
            log.error(
                    "Rotation minimum ({}) must be less than or equal to rotation maximum ({})",
                    rotationMin,
                    rotationMax);
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.rotationRangeInvalid", // TODO
                    "Rotation minimum ({0}) must be less than or equal to rotation maximum ({1})",
                    rotationMin,
                    rotationMax);
        }

        // Validate font size range: fontSizeMin <= fontSizeMax
        Float fontSizeMin = request.getFontSizeMin();
        Float fontSizeMax = request.getFontSizeMax();
        if (fontSizeMin != null && fontSizeMax != null && fontSizeMin > fontSizeMax) {
            log.error(
                    "Font size minimum ({}) must be less than or equal to font size maximum ({})",
                    fontSizeMin,
                    fontSizeMax);
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.fontSizeRangeInvalid", // TODO
                    "Font size minimum ({0}) must be less than or equal to font size maximum ({1})",
                    fontSizeMin,
                    fontSizeMax);
        }

        // Validate color format when not using random color
        String customColor = request.getCustomColor();
        Boolean randomColor = request.getRandomColor();
        if (customColor != null && !Boolean.TRUE.equals(randomColor)) {
            // Check if color is valid hex format (#RRGGBB or #RRGGBBAA)
            if (!getColorPattern().matcher(customColor).matches()) {
                log.error(
                        "Invalid color format: {}. Expected hex format like #RRGGBB or #RRGGBBAA",
                        customColor);
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.invalidColorFormat", // TODO
                        "Invalid color format: {0}. Expected hex format like #RRGGBB or #RRGGBBAA",
                        customColor);
            }
        }

        // Validate mirroring probability bounds (0.0 - 1.0)
        Float mirroringProbability = request.getMirroringProbability();
        if (mirroringProbability != null
                && (mirroringProbability < 0.0f || mirroringProbability > 1.0f)) {
            log.error(
                    "Mirroring probability must be between 0.0 and 1.0, but got: {}",
                    mirroringProbability);
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.mirroringProbabilityOutOfRange", // TODO
                    "Mirroring probability must be between 0.0 and 1.0, but got: {0}",
                    mirroringProbability);
        }

        // Validate watermark type
        String watermarkType = request.getWatermarkType();
        if (watermarkType == null
                || (!watermarkType.equalsIgnoreCase("text")
                        && !watermarkType.equalsIgnoreCase("image"))) {
            log.error("Watermark type must be 'text' or 'image', but got: {}", watermarkType);
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.unsupportedWatermarkType", // TODO
                    "Watermark type must be ''text'' or ''image'', but got: {0}", // single quotes
                    // must be escaped
                    watermarkType);
        }

        // Validate text watermark has text
        if ("text".equalsIgnoreCase(watermarkType)) {
            String watermarkText = request.getWatermarkText();
            if (watermarkText == null || watermarkText.trim().isEmpty()) {
                log.error("Watermark text is required when watermark type is 'text'");
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.watermarkTextRequired", // TODO
                        "Watermark text is required when watermark type is 'text'");
            }
        }

        // Validate image watermark has image
        if ("image".equalsIgnoreCase(watermarkType)) {
            MultipartFile watermarkImage = request.getWatermarkImage();
            if (watermarkImage == null || watermarkImage.isEmpty()) {
                log.error("Watermark image is required when watermark type is 'image'");
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.watermarkImageRequired", // TODO
                        "Watermark image is required when watermark type is 'image'");
            }

            // Validate image type - only allow common image formats
            String contentType = watermarkImage.getContentType();
            String originalFilename = watermarkImage.getOriginalFilename();
            if (contentType != null && !isSupportedImageType(contentType)) {
                log.error(
                        "Unsupported image type: {}. Supported types: PNG, JPG, JPEG, GIF, BMP",
                        contentType);
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.unsupportedContentType", // TODO
                        "Unsupported image type: {0}. Supported types: PNG, JPG, JPEG, GIF, BMP",
                        contentType);
            }

            // Additional check based on file extension
            if (originalFilename != null && !hasSupportedImageExtension(originalFilename)) {
                log.error(
                        "Unsupported image file extension in: {}. Supported extensions: .png, .jpg, .jpeg, .gif, .bmp",
                        originalFilename);
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.unsupportedImageFileType", // TODO
                        "Unsupported image file extension in: {0}. Supported extensions: .png, .jpg, .jpeg, .gif, .bmp",
                        originalFilename);
            }
        }

        log.debug("Watermark request validation passed");
    }

    /** Checks if the content type is a supported image format. */
    private boolean isSupportedImageType(String contentType) {
        return contentType.equals("image/png")
                || contentType.equals("image/jpeg")
                || contentType.equals("image/jpg")
                || contentType.equals("image/gif")
                || contentType.equals("image/bmp")
                || contentType.equals("image/x-ms-bmp");
    }

    /** Checks if the filename has a supported image extension. */
    private boolean hasSupportedImageExtension(String filename) {
        String lowerFilename = filename.toLowerCase();
        return lowerFilename.endsWith(".png")
                || lowerFilename.endsWith(".jpg")
                || lowerFilename.endsWith(".jpeg")
                || lowerFilename.endsWith(".gif")
                || lowerFilename.endsWith(".bmp");
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/add-watermark")
    @Operation(
            summary = "Add watermark to a PDF file",
            description =
                    "This endpoint adds a watermark to a given PDF file. Users can specify the"
                            + " watermark type (text or image), rotation, opacity, width spacer, and"
                            + " height spacer. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> addWatermark(@ModelAttribute AddWatermarkRequest request)
            throws IOException {
        MultipartFile pdfFile = request.getFileInput();
        String pdfFileName = pdfFile.getOriginalFilename();
        if (pdfFileName != null && (pdfFileName.contains("..") || pdfFileName.startsWith("/"))) {
            log.error("Security violation: Invalid file path in pdfFile: {}", pdfFileName);
            throw new SecurityException("Invalid file path in pdfFile");
        }
        String watermarkType = request.getWatermarkType();
        MultipartFile watermarkImage = request.getWatermarkImage();
        if (watermarkImage != null) {
            String watermarkImageFileName = watermarkImage.getOriginalFilename();
            if (watermarkImageFileName != null
                    && (watermarkImageFileName.contains("..")
                            || watermarkImageFileName.startsWith("/"))) {
                log.error(
                        "Security violation: Invalid file path in watermarkImage: {}",
                        watermarkImageFileName);
                throw new SecurityException("Invalid file path in watermarkImage");
            }
        }

        // Validate request parameters and enforce safety caps
        validateWatermarkRequest(request);

        // Extract new fields with defaults for backward compatibility
        boolean convertPdfToImage = Boolean.TRUE.equals(request.getConvertPDFToImage());

        // Create a randomizer with optional seed for deterministic behavior
        WatermarkRandomizer randomizer = new WatermarkRandomizer(request.getSeed());

        // Load the input PDF
        PDDocument document = pdfDocumentFactory.load(pdfFile);

        // Create a page in the document
        for (PDPage page : document.getPages()) {

            // Get the page's content stream
            PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true);

            // Set transparency
            PDExtendedGraphicsState graphicsState = new PDExtendedGraphicsState();
            graphicsState.setNonStrokingAlphaConstant(request.getOpacity());
            contentStream.setGraphicsStateParameters(graphicsState);

            if ("text".equalsIgnoreCase(watermarkType)) {
                addTextWatermark(contentStream, document, page, request, randomizer);
            } else if ("image".equalsIgnoreCase(watermarkType)) {
                addImageWatermark(contentStream, document, page, request, randomizer);
            }

            // Close the content stream
            contentStream.close();
        }

        if (convertPdfToImage) {
            PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document);
            document.close();
            document = convertedPdf;
        }

        // Return the watermarked PDF as a response
        return WebResponseUtils.pdfDocToWebResponse(
                document,
                GeneralUtils.generateFilename(pdfFile.getOriginalFilename(), "_watermarked.pdf"));
    }

    private void addTextWatermark(
            PDPageContentStream contentStream,
            PDDocument document,
            PDPage page,
            AddWatermarkRequest request,
            WatermarkRandomizer randomizer)
            throws IOException {

        String watermarkText = request.getWatermarkText();
        String alphabet = request.getAlphabet();
        String colorString = request.getCustomColor();
        float rotation = request.getRotation();
        int widthSpacer = request.getWidthSpacer();
        int heightSpacer = request.getHeightSpacer();
        float fontSize = request.getFontSize();

        // Extract new fields with defaults
        int count = (request.getCount() != null) ? request.getCount() : 1;
        boolean randomPosition = Boolean.TRUE.equals(request.getRandomPosition());
        boolean randomFont = Boolean.TRUE.equals(request.getRandomFont());
        boolean randomColor = Boolean.TRUE.equals(request.getRandomColor());
        boolean perLetterFont = Boolean.TRUE.equals(request.getPerLetterFont());
        boolean perLetterColor = Boolean.TRUE.equals(request.getPerLetterColor());
        boolean perLetterSize = Boolean.TRUE.equals(request.getPerLetterSize());
        boolean perLetterOrientation = Boolean.TRUE.equals(request.getPerLetterOrientation());
        boolean shadingRandom = Boolean.TRUE.equals(request.getShadingRandom());
        String shading = request.getShading();

        float rotationMin =
                (request.getRotationMin() != null) ? request.getRotationMin() : rotation;
        float rotationMax =
                (request.getRotationMax() != null) ? request.getRotationMax() : rotation;
        float fontSizeMin =
                (request.getFontSizeMin() != null) ? request.getFontSizeMin() : fontSize;
        float fontSizeMax =
                (request.getFontSizeMax() != null) ? request.getFontSizeMax() : fontSize;

        // Extract per-letter configuration with defaults
        int perLetterFontCount =
                (request.getPerLetterFontCount() != null) ? request.getPerLetterFontCount() : 2;
        int perLetterColorCount =
                (request.getPerLetterColorCount() != null) ? request.getPerLetterColorCount() : 4;
        float perLetterSizeMin =
                (request.getPerLetterSizeMin() != null) ? request.getPerLetterSizeMin() : 10f;
        float perLetterSizeMax =
                (request.getPerLetterSizeMax() != null) ? request.getPerLetterSizeMax() : 100f;
        float perLetterOrientationMin =
                (request.getPerLetterOrientationMin() != null)
                        ? request.getPerLetterOrientationMin()
                        : 0f;
        float perLetterOrientationMax =
                (request.getPerLetterOrientationMax() != null)
                        ? request.getPerLetterOrientationMax()
                        : 360f;

        String resourceDir =
                switch (alphabet) {
                    case "arabic" -> "static/fonts/NotoSansArabic-Regular.ttf";
                    case "japanese" -> "static/fonts/Meiryo.ttf";
                    case "korean" -> "static/fonts/malgun.ttf";
                    case "chinese" -> "static/fonts/SimSun.ttf";
                    case "thai" -> "static/fonts/NotoSansThai-Regular.ttf";
                    default -> "static/fonts/NotoSans-Regular.ttf";
                };

        ClassPathResource classPathResource = new ClassPathResource(resourceDir);
        String fileExtension = resourceDir.substring(resourceDir.lastIndexOf("."));
        File tempFile = Files.createTempFile("NotoSansFont", fileExtension).toFile();

        PDFont font;
        try (InputStream is = classPathResource.getInputStream();
                FileOutputStream os = new FileOutputStream(tempFile)) {
            IOUtils.copy(is, os);
            font = PDType0Font.load(document, tempFile);
        } finally {
            Files.deleteIfExists(tempFile.toPath());
        }

        String[] textLines =
                RegexPatternUtils.getInstance().getEscapedNewlinePattern().split(watermarkText);

        float pageWidth = page.getMediaBox().getWidth();
        float pageHeight = page.getMediaBox().getHeight();

        // Determine positions based on a randomPosition flag
        java.util.List<float[]> positions;

        // Calculate approximate watermark dimensions for positioning
        // Estimate width based on average character width (more accurate than fixed 100)
        float avgCharWidth = fontSize * 0.6f; // Approximate average character width
        float maxLineWidth = 0;
        for (String line : textLines) {
            float lineWidth = line.length() * avgCharWidth;
            if (lineWidth > maxLineWidth) {
                maxLineWidth = lineWidth;
            }
        }
        float watermarkWidth = maxLineWidth;
        float watermarkHeight = fontSize * textLines.length;

        if (randomPosition) {
            // Generate random positions
            positions = new java.util.ArrayList<>();
            for (int i = 0; i < count; i++) {
                float[] pos =
                        randomizer.generateRandomPosition(
                                pageWidth, pageHeight, watermarkWidth, watermarkHeight);
                positions.add(pos);
            }
        } else {
            // Generate grid positions (backward compatible)
            positions =
                    randomizer.generateGridPositions(
                            pageWidth,
                            pageHeight,
                            watermarkWidth,
                            watermarkHeight,
                            widthSpacer,
                            heightSpacer,
                            count);
        }

        // Define available fonts for random selection
        java.util.List<String> availableFonts =
                java.util.Arrays.asList(
                        "Helvetica",
                        "Times-Roman",
                        "Courier",
                        "Helvetica-Bold",
                        "Times-Bold",
                        "Courier-Bold");

        // Render each watermark instance
        for (float[] pos : positions) {
            float x = pos[0];
            float y = pos[1];

            // Determine the font for this watermark instance
            PDFont wmFont;
            if (randomFont) {
                try {
                    String selectedFontName = randomizer.selectRandomFont(availableFonts);
                    wmFont = new PDType1Font(Standard14Fonts.getMappedFontName(selectedFontName));
                } catch (Exception e) {
                    log.warn("Failed to load random font, using base font instead", e);
                    wmFont = font; // Fall back to the base font loaded earlier
                }
            } else {
                wmFont = font; // Use the base font loaded from alphabet selection
            }

            // Determine rotation for this watermark
            float wmRotation = randomizer.generateRandomRotation(rotationMin, rotationMax);

            // Determine font size for this watermark
            float wmFontSize = randomizer.generateRandomFontSize(fontSizeMin, fontSizeMax);

            // Determine color for this watermark
            Color wmColor;
            if (randomColor) {
                wmColor = randomizer.generateRandomColor(true);
            } else {
                try {
                    String colorStr = colorString;
                    if (!colorStr.startsWith("#")) {
                        colorStr = "#" + colorStr;
                    }
                    wmColor = Color.decode(colorStr);
                } catch (Exception e) {
                    wmColor = Color.LIGHT_GRAY;
                }
            }

            // Determine and apply shading style
            String wmShading =
                    shadingRandom
                            ? randomizer.selectRandomShading(
                                    java.util.Arrays.asList("none", "light", "dark"))
                            : (shading != null ? shading : "none");

            // Apply shading by adjusting color intensity
            wmColor = applyShadingToColor(wmColor, wmShading);

            // Render text with per-letter variations if enabled
            if (perLetterFont || perLetterColor || perLetterSize || perLetterOrientation) {
                renderTextWithPerLetterVariations(
                        contentStream,
                        textLines,
                        wmFont,
                        wmFontSize,
                        wmColor,
                        wmRotation,
                        x,
                        y,
                        perLetterFont,
                        perLetterColor,
                        perLetterSize,
                        perLetterOrientation,
                        perLetterSizeMin,
                        perLetterSizeMax,
                        perLetterFontCount,
                        perLetterColorCount,
                        perLetterOrientationMin,
                        perLetterOrientationMax,
                        randomizer);
            } else {
                // Standard rendering without per-letter variations
                contentStream.setFont(wmFont, wmFontSize);
                contentStream.setNonStrokingColor(wmColor);
                contentStream.beginText();
                contentStream.setTextMatrix(
                        Matrix.getRotateInstance((float) Math.toRadians(wmRotation), x, y));

                for (String textLine : textLines) {
                    contentStream.showText(textLine);
                    contentStream.newLineAtOffset(0, -wmFontSize);
                }

                contentStream.endText();
            }
        }
    }

    private void renderTextWithPerLetterVariations(
            PDPageContentStream contentStream,
            String[] textLines,
            PDFont baseFont,
            float baseFontSize,
            Color baseColor,
            float baseRotation,
            float startX,
            float startY,
            boolean perLetterFont,
            boolean perLetterColor,
            boolean perLetterSize,
            boolean perLetterOrientation,
            float fontSizeMin,
            float fontSizeMax,
            int perLetterFontCount,
            int perLetterColorCount,
            float perLetterOrientationMin,
            float perLetterOrientationMax,
            WatermarkRandomizer randomizer)
            throws IOException {

        float currentX = startX;
        float currentY = startY;

        for (String line : textLines) {
            currentX = startX;
            for (int i = 0; i < line.length(); i++) {
                char c = line.charAt(i);
                String charStr = String.valueOf(c);

                // Determine per-letter attributes
                float letterSize =
                        perLetterSize
                                ? randomizer.generateRandomFontSize(fontSizeMin, fontSizeMax)
                                : baseFontSize;

                Color letterColor =
                        perLetterColor
                                ? randomizer.generateRandomColorFromPalette(perLetterColorCount)
                                : baseColor;

                float letterRotation =
                        perLetterOrientation
                                ? randomizer.generatePerLetterRotationInRange(
                                        perLetterOrientationMin, perLetterOrientationMax)
                                : baseRotation;

                // Determine per-letter font
                PDFont letterFont = baseFont;
                if (perLetterFont) {
                    try {
                        String randomFontName =
                                randomizer.selectRandomFontFromCount(perLetterFontCount);
                        letterFont =
                                new PDType1Font(Standard14Fonts.getMappedFontName(randomFontName));
                    } catch (Exception e) {
                        // Fall back to base font if font loading fails
                        log.warn("Failed to load random font, using base font instead", e);
                    }
                }

                // Set font and color
                contentStream.setFont(letterFont, letterSize);
                contentStream.setNonStrokingColor(letterColor);

                // Render the character
                contentStream.beginText();
                contentStream.setTextMatrix(
                        Matrix.getRotateInstance(
                                (float) Math.toRadians(letterRotation), currentX, currentY));
                contentStream.showText(charStr);
                contentStream.endText();

                // Advance position
                float charWidth = letterFont.getStringWidth(charStr) * letterSize / 1000;
                currentX += charWidth;
            }
            currentY -= baseFontSize;
        }
    }

    private void addImageWatermark(
            PDPageContentStream contentStream,
            PDDocument document,
            PDPage page,
            AddWatermarkRequest request,
            WatermarkRandomizer randomizer)
            throws IOException {

        MultipartFile watermarkImage = request.getWatermarkImage();
        float rotation = request.getRotation();
        int widthSpacer = request.getWidthSpacer();
        int heightSpacer = request.getHeightSpacer();
        float fontSize = request.getFontSize();

        // Extract new fields with defaults
        int count = (request.getCount() != null) ? request.getCount() : 1;
        boolean randomPosition = Boolean.TRUE.equals(request.getRandomPosition());
        boolean randomMirroring = Boolean.TRUE.equals(request.getRandomMirroring());
        float mirroringProbability =
                (request.getMirroringProbability() != null)
                        ? request.getMirroringProbability()
                        : 0.5f;
        float imageScale = (request.getImageScale() != null) ? request.getImageScale() : 1.0f;
        float rotationMin =
                (request.getRotationMin() != null) ? request.getRotationMin() : rotation;
        float rotationMax =
                (request.getRotationMax() != null) ? request.getRotationMax() : rotation;

        // Load the watermark image
        BufferedImage image = ImageIO.read(watermarkImage.getInputStream());

        // Compute width based on an original aspect ratio
        float aspectRatio = (float) image.getWidth() / (float) image.getHeight();

        // Desired physical height (in PDF points) with scale applied
        float desiredPhysicalHeight = fontSize * imageScale;

        // Desired physical width based on the aspect ratio
        float desiredPhysicalWidth = desiredPhysicalHeight * aspectRatio;

        // Convert the BufferedImage to PDImageXObject
        PDImageXObject xobject = LosslessFactory.createFromImage(document, image);

        // Get page dimensions
        float pageWidth = page.getMediaBox().getWidth();
        float pageHeight = page.getMediaBox().getHeight();

        // Determine positions based on a randomPosition flag
        java.util.List<float[]> positions;
        if (randomPosition) {
            // Generate random positions
            positions = new java.util.ArrayList<>();
            for (int i = 0; i < count; i++) {
                float[] pos =
                        randomizer.generateRandomPosition(
                                pageWidth, pageHeight, desiredPhysicalWidth, desiredPhysicalHeight);
                positions.add(pos);
            }
        } else {
            // Generate grid positions (backward compatible)
            positions =
                    randomizer.generateGridPositions(
                            pageWidth,
                            pageHeight,
                            desiredPhysicalWidth,
                            desiredPhysicalHeight,
                            widthSpacer,
                            heightSpacer,
                            count);
        }

        // Render each watermark instance
        for (float[] pos : positions) {
            float x = pos[0];
            float y = pos[1];

            // Determine rotation for this watermark
            float wmRotation = randomizer.generateRandomRotation(rotationMin, rotationMax);

            // Determine if this watermark should be mirrored
            boolean shouldMirror = randomMirroring && randomizer.shouldMirror(mirroringProbability);

            // Save the graphics state
            contentStream.saveGraphicsState();

            // Translate to center of image position
            contentStream.transform(
                    Matrix.getTranslateInstance(
                            x + desiredPhysicalWidth / 2, y + desiredPhysicalHeight / 2));

            // Apply rotation
            contentStream.transform(Matrix.getRotateInstance(Math.toRadians(wmRotation), 0, 0));

            // Apply mirroring if needed (horizontal flip)
            if (shouldMirror) {
                contentStream.transform(Matrix.getScaleInstance(-1, 1));
            }

            // Translate back to draw from corner
            contentStream.transform(
                    Matrix.getTranslateInstance(
                            -desiredPhysicalWidth / 2, -desiredPhysicalHeight / 2));

            // Draw the image and restore the graphics state
            contentStream.drawImage(xobject, 0, 0, desiredPhysicalWidth, desiredPhysicalHeight);
            contentStream.restoreGraphicsState();
        }
    }

    /**
     * Applies shading to a color by adjusting its intensity.
     *
     * @param color Original color
     * @param shading Shading style: "none", "light", or "dark"
     * @return Color with shading applied
     */
    private Color applyShadingToColor(Color color, String shading) {
        if (shading == null || "none".equalsIgnoreCase(shading)) {
            return color;
        }

        int r = color.getRed();
        int g = color.getGreen();
        int b = color.getBlue();

        if ("light".equalsIgnoreCase(shading)) {
            // Lighten the color by moving towards white
            r = r + (255 - r) / 2;
            g = g + (255 - g) / 2;
            b = b + (255 - b) / 2;
        } else if ("dark".equalsIgnoreCase(shading)) {
            // Darken the color by moving towards black
            r = r / 2;
            g = g / 2;
            b = b / 2;
        }

        return new Color(r, g, b);
    }
}
