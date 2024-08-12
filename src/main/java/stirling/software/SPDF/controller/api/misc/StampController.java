package stirling.software.SPDF.controller.api.misc;

import java.awt.*;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.List;

import javax.imageio.ImageIO;

import org.apache.commons.io.IOUtils;
import org.apache.pdfbox.Loader;
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
import org.springframework.util.Assert;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.misc.AddStampRequest;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class StampController {

    @PostMapping(consumes = "multipart/form-data", value = "/add-stamp")
    @Operation(
            summary = "Add stamp to a PDF file",
            description =
                    "This endpoint adds a stamp to a given PDF file. Users can specify the stamp type (text or image), rotation, opacity, width spacer, and height spacer. Input:PDF Output:PDF Type:SISO")
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
        int pagingPosition = request.getPagingPosition();
        int firstPageRate = request.getFirstPageRate();
        boolean autoCrop = request.isAutoCrop();

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
        PDDocument document = Loader.loadPDF(pdfFile.getBytes());

        if (autoCrop && "image".equalsIgnoreCase(stampType)){
            addPagingSeal(
                    document,
                    stampImage,
                    rotation,
                    pagingPosition,
                    fontSize,
                    overrideY,
                    opacity,
                    firstPageRate);
        }else{
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

        contentStream.beginText();
        contentStream.setTextMatrix(Matrix.getRotateInstance(Math.toRadians(rotation), x, y));
        contentStream.showText(stampText);
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

    private void addPagingSeal(
            PDDocument document,
            MultipartFile stampImage,
            float rotation,
            int pagingPosition,
            float size,
            float overrideY,
            float opacity,
            int firstPageRate) throws IOException {
        Assert.notNull(stampImage,"The Stamp Image must not be null.");

        BufferedImage sourceImage = ImageIO.read(stampImage.getInputStream());
        float firstPageSealRate = firstPageRate / 100.0f;
        int numberOfPages = document.getNumberOfPages();
        int remainPage = numberOfPages - 1;

        // scaled and rotation image
        BufferedImage image = scaledAndRotationImage(size,rotation, sourceImage);

        int firstPageStampWidth = 0;
        int otherPageStampWidth = 0;

        // The proportion of the first page
        if (firstPageSealRate > 0.0f) {
            firstPageStampWidth = ((Float) (image.getWidth() * firstPageSealRate)).intValue();
            otherPageStampWidth = (image.getWidth() - firstPageStampWidth) / remainPage;
        } else {
            // average every page
            firstPageStampWidth = otherPageStampWidth = image.getWidth() / numberOfPages;
        }

        // Balance the width of the first page
        int remainWidth = image.getWidth() - firstPageStampWidth;
        if (remainWidth != otherPageStampWidth * remainPage) {
            firstPageStampWidth += remainWidth - otherPageStampWidth * remainPage;
        }

        // set opacity
        PDExtendedGraphicsState graphicsState = new PDExtendedGraphicsState();
        graphicsState.setNonStrokingAlphaConstant(opacity);

        // foreach the pdf and sealed
        BufferedImage croppedImg;
        PDImageXObject sealImage;
        for (int i = 0; i < numberOfPages; i++) {
            PDPage page = document.getPage(i);
            PDRectangle pageSize = page.getMediaBox();
            int stampWidth = i == 0 ? firstPageStampWidth : otherPageStampWidth;
            int stampX = i == 0 ? 0 : firstPageStampWidth + (i - 1) * stampWidth;
            croppedImg = image.getSubimage(stampX, 0, stampWidth, image.getHeight());

            // Create the PDImageXObject for the seal image
            sealImage = LosslessFactory.createFromImage(document, croppedImg);
            float y;
            if (overrideY >= 0) {
                // Use override values if provided
                y = overrideY;
            } else {
                y =calculatePositionY(pageSize, pagingPosition,size, 0.0f);
            }
            // create PDPageContentStream
            try (PDPageContentStream contentStream =
                         new PDPageContentStream(
                                 document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
                float startX = pageSize.getUpperRightX() - sealImage.getWidth();
                // transform and drawImage
                contentStream.setGraphicsStateParameters(graphicsState);
                contentStream.transform(Matrix.getTranslateInstance(startX, y));
                contentStream.drawImage(sealImage, 0, 0);
            }
        }



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


    private BufferedImage scaledAndRotationImage(float sealSize, float rotation, BufferedImage sourceImage) {
        if (sourceImage == null) {
            throw new IllegalArgumentException("stamp image cannot be null.");
        }

        BufferedImage image = sourceImage;
        boolean scale = sealSize > 0.0f;
        boolean rotate = rotation > 0.0f;

        if (scale || rotate) {
            // Desired physical height (in PDF points)
            Float desiredPhysicalHeight = sealSize;
            // Compute width based on original aspect ratio
            float aspectRatio = (float) sourceImage.getWidth() / (float) sourceImage.getHeight();
            int newWidth = scale ? (int) (desiredPhysicalHeight  * aspectRatio) : sourceImage.getWidth();
            int newHeight = scale ? desiredPhysicalHeight.intValue() : sourceImage.getHeight();

            // create BufferedImage
            image = new BufferedImage(newWidth, newHeight, BufferedImage.TYPE_INT_ARGB);
            Graphics2D graphics = image.createGraphics();

            // set render
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

            AffineTransform transform = new AffineTransform();
            if (rotate) {
                transform.rotate(Math.toRadians(rotation), newWidth / 2.0, newHeight / 2.0);
            }
            graphics.setTransform(transform);
            graphics.drawImage(sourceImage, 0, 0,image.getWidth(),image.getHeight(), null);

            graphics.dispose();
        }

        return image;
    }
}
