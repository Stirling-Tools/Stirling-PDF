package stirling.software.SPDF.controller.api.misc;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Random;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.misc.ScannerEffectRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous PDF APIs")
@RequiredArgsConstructor
@Slf4j
public class ScannerEffectController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private static final Random RANDOM = new Random();

    // Size limits to prevent OutOfMemoryError
    private static final int MAX_IMAGE_WIDTH = 8192;
    private static final int MAX_IMAGE_HEIGHT = 8192;
    private static final long MAX_IMAGE_PIXELS = 16_777_216; // 4096x4096

    @PostMapping(value = "/scanner-effect", consumes = "multipart/form-data")
    @Operation(
            summary = "Apply scanner effect to PDF",
            description =
                    "Applies various effects to simulate a scanned document, including rotation, noise, and edge softening. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> scannerEffect(@Valid @ModelAttribute ScannerEffectRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();

        // Apply preset first if needed
        if (!request.isAdvancedEnabled()) {
            switch (request.getQuality()) {
                case high -> request.applyHighQualityPreset();
                case medium -> request.applyMediumQualityPreset();
                case low -> request.applyLowQualityPreset();
            }
        }

        // Extract values after preset application
        int baseRotation = request.getRotationValue() + request.getRotate();
        int rotateVariance = request.getRotateVariance();
        int borderPx = request.getBorder();
        float brightness = request.getBrightness();
        float contrast = request.getContrast();
        float blur = request.getBlur();
        float noise = request.getNoise();
        boolean yellowish = request.isYellowish();
        int resolution = request.getResolution();
        ScannerEffectRequest.Colorspace colorspace = request.getColorspace();

        try (PDDocument document = pdfDocumentFactory.load(file)) {
            PDDocument outputDocument = new PDDocument();
            PDFRenderer pdfRenderer = new PDFRenderer(document);

            for (int i = 0; i < document.getNumberOfPages(); i++) {
                // Get page dimensions to calculate safe resolution
                PDRectangle pageSize = document.getPage(i).getMediaBox();
                float pageWidthPts = pageSize.getWidth();
                float pageHeightPts = pageSize.getHeight();

                // Calculate what the image dimensions would be at the requested resolution
                int projectedWidth = (int) Math.ceil(pageWidthPts * resolution / 72.0);
                int projectedHeight = (int) Math.ceil(pageHeightPts * resolution / 72.0);
                long projectedPixels = (long) projectedWidth * projectedHeight;

                // Calculate safe resolution that stays within limits
                int safeResolution = resolution;
                if (projectedWidth > MAX_IMAGE_WIDTH
                        || projectedHeight > MAX_IMAGE_HEIGHT
                        || projectedPixels > MAX_IMAGE_PIXELS) {
                    double widthScale = (double) MAX_IMAGE_WIDTH / projectedWidth;
                    double heightScale = (double) MAX_IMAGE_HEIGHT / projectedHeight;
                    double pixelScale = Math.sqrt((double) MAX_IMAGE_PIXELS / projectedPixels);
                    double minScale = Math.min(Math.min(widthScale, heightScale), pixelScale);
                    safeResolution = (int) Math.max(72, resolution * minScale);

                    log.warn(
                            "Page {} would be too large at {}dpi ({}x{} pixels). Reducing to {}dpi",
                            i + 1,
                            resolution,
                            projectedWidth,
                            projectedHeight,
                            safeResolution);
                }

                // Render page to image with safe resolution
                BufferedImage image = pdfRenderer.renderImageWithDPI(i, safeResolution);

                log.debug(
                        "Processing page {} with dimensions {}x{} ({} pixels) at {}dpi",
                        i + 1,
                        image.getWidth(),
                        image.getHeight(),
                        (long) image.getWidth() * image.getHeight(),
                        safeResolution);

                // 1. Convert to grayscale or keep color
                BufferedImage processed;
                if (colorspace == ScannerEffectRequest.Colorspace.grayscale) {
                    processed =
                            new BufferedImage(
                                    image.getWidth(),
                                    image.getHeight(),
                                    BufferedImage.TYPE_INT_RGB);
                    Graphics2D gGray = processed.createGraphics();
                    gGray.setColor(Color.BLACK);
                    gGray.fillRect(0, 0, image.getWidth(), image.getHeight());
                    gGray.drawImage(image, 0, 0, null);
                    gGray.dispose();

                    // Convert to grayscale manually
                    for (int y = 0; y < processed.getHeight(); y++) {
                        for (int x = 0; x < processed.getWidth(); x++) {
                            int rgb = processed.getRGB(x, y);
                            int r = (rgb >> 16) & 0xFF;
                            int g = (rgb >> 8) & 0xFF;
                            int b = rgb & 0xFF;
                            int gray = (r + g + b) / 3;
                            int grayRGB = (gray << 16) | (gray << 8) | gray;
                            processed.setRGB(x, y, grayRGB);
                        }
                    }
                } else {
                    processed =
                            new BufferedImage(
                                    image.getWidth(),
                                    image.getHeight(),
                                    BufferedImage.TYPE_INT_RGB);
                    Graphics2D gCol = processed.createGraphics();
                    gCol.drawImage(image, 0, 0, null);
                    gCol.dispose();
                }

                // 2. Add border with randomized grey gradient
                int baseW = processed.getWidth() + 2 * borderPx;
                int baseH = processed.getHeight() + 2 * borderPx;
                boolean vertical = RANDOM.nextBoolean();
                float startGrey = 0.6f + 0.3f * RANDOM.nextFloat();
                float endGrey = 0.6f + 0.3f * RANDOM.nextFloat();
                Color startColor =
                        new Color(
                                Math.round(startGrey * 255),
                                Math.round(startGrey * 255),
                                Math.round(startGrey * 255));
                Color endColor =
                        new Color(
                                Math.round(endGrey * 255),
                                Math.round(endGrey * 255),
                                Math.round(endGrey * 255));
                BufferedImage composed = new BufferedImage(baseW, baseH, processed.getType());
                Graphics2D gBg = composed.createGraphics();
                for (int y = 0; y < baseH; y++) {
                    for (int x = 0; x < baseW; x++) {
                        float frac = vertical ? (float) y / (baseH - 1) : (float) x / (baseW - 1);
                        int r =
                                Math.round(
                                        startColor.getRed()
                                                + (endColor.getRed() - startColor.getRed()) * frac);
                        int g =
                                Math.round(
                                        startColor.getGreen()
                                                + (endColor.getGreen() - startColor.getGreen())
                                                        * frac);
                        int b =
                                Math.round(
                                        startColor.getBlue()
                                                + (endColor.getBlue() - startColor.getBlue())
                                                        * frac);
                        composed.setRGB(x, y, new Color(r, g, b).getRGB());
                    }
                }
                gBg.drawImage(processed, borderPx, borderPx, null);
                gBg.dispose();

                // 3. Rotate the entire composed image
                double pageRotation = baseRotation;
                if (baseRotation != 0 || rotateVariance != 0) {
                    pageRotation += (RANDOM.nextDouble() * 2 - 1) * rotateVariance;
                }

                BufferedImage rotated;
                int w = composed.getWidth();
                int h = composed.getHeight();
                int rotW = w;
                int rotH = h;

                // Skip rotation entirely if no rotation is needed
                if (pageRotation == 0) {
                    rotated = composed;
                } else {
                    double radians = Math.toRadians(pageRotation);
                    double sin = Math.abs(Math.sin(radians));
                    double cos = Math.abs(Math.cos(radians));
                    rotW = (int) Math.floor(w * cos + h * sin);
                    rotH = (int) Math.floor(h * cos + w * sin);
                    BufferedImage rotatedBg = new BufferedImage(rotW, rotH, composed.getType());
                    Graphics2D gBgRot = rotatedBg.createGraphics();
                    for (int y = 0; y < rotH; y++) {
                        for (int x = 0; x < rotW; x++) {
                            float frac = vertical ? (float) y / (rotH - 1) : (float) x / (rotW - 1);
                            int r =
                                    Math.round(
                                            startColor.getRed()
                                                    + (endColor.getRed() - startColor.getRed())
                                                            * frac);
                            int g =
                                    Math.round(
                                            startColor.getGreen()
                                                    + (endColor.getGreen() - startColor.getGreen())
                                                            * frac);
                            int b =
                                    Math.round(
                                            startColor.getBlue()
                                                    + (endColor.getBlue() - startColor.getBlue())
                                                            * frac);
                            rotatedBg.setRGB(x, y, new Color(r, g, b).getRGB());
                        }
                    }
                    gBgRot.dispose();
                    rotated = new BufferedImage(rotW, rotH, composed.getType());
                    Graphics2D g2d = rotated.createGraphics();
                    g2d.drawImage(rotatedBg, 0, 0, null);
                    AffineTransform at = new AffineTransform();
                    at.translate((rotW - w) / 2.0, (rotH - h) / 2.0);
                    at.rotate(radians, w / 2.0, h / 2.0);
                    g2d.setRenderingHint(
                            RenderingHints.KEY_INTERPOLATION,
                            RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                    g2d.setRenderingHint(
                            RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
                    g2d.setRenderingHint(
                            RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                    g2d.drawImage(composed, at, null);
                    g2d.dispose();
                }

                // 4. Scale and center the rotated image to cover the original page size
                PDRectangle origPageSize = document.getPage(i).getMediaBox();
                float origW = origPageSize.getWidth();
                float origH = origPageSize.getHeight();
                float scale = Math.max(origW / rotW, origH / rotH);
                float drawW = rotW * scale;
                float drawH = rotH * scale;
                float offsetX = (origW - drawW) / 2f;
                float offsetY = (origH - drawH) / 2f;

                // 5. Apply adaptive blur and edge softening
                BufferedImage softened =
                        softenEdges(
                                rotated,
                                Math.max(10, Math.round(Math.min(rotW, rotH) * 0.02f)),
                                startColor,
                                endColor,
                                vertical);
                BufferedImage blurred = applyGaussianBlur(softened, blur);

                // 6. Adjust brightness and contrast
                BufferedImage adjusted = adjustBrightnessContrast(blurred, brightness, contrast);

                // 7. Add noise and yellowish effect to the content
                if (yellowish) {
                    applyYellowishEffect(adjusted);
                }
                addGaussianNoise(adjusted, noise);

                // 8. Write to PDF
                PDPage newPage = new PDPage(new PDRectangle(origW, origH));
                outputDocument.addPage(newPage);
                try (PDPageContentStream contentStream =
                        new PDPageContentStream(outputDocument, newPage)) {
                    PDImageXObject pdImage =
                            LosslessFactory.createFromImage(outputDocument, adjusted);
                    contentStream.drawImage(pdImage, offsetX, offsetY, drawW, drawH);
                }
            }

            // Save to byte array
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            outputDocument.save(outputStream);
            outputDocument.close();

            String outputFilename =
                    Filenames.toSimpleFileName(file.getOriginalFilename())
                                    .replaceFirst("[.][^.]+$", "")
                            + "_scanner_effect.pdf";

            return WebResponseUtils.bytesToWebResponse(
                    outputStream.toByteArray(), outputFilename, MediaType.APPLICATION_PDF);
        }
    }

    private BufferedImage softenEdges(
            BufferedImage image,
            int featherRadius,
            Color startColor,
            Color endColor,
            boolean vertical) {
        int width = image.getWidth();
        int height = image.getHeight();
        BufferedImage output = new BufferedImage(width, height, image.getType());
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int dx = Math.min(x, width - 1 - x);
                int dy = Math.min(y, height - 1 - y);
                int d = Math.min(dx, dy);
                float frac = vertical ? (float) y / (height - 1) : (float) x / (width - 1);
                int rBg =
                        Math.round(
                                startColor.getRed()
                                        + (endColor.getRed() - startColor.getRed()) * frac);
                int gBg =
                        Math.round(
                                startColor.getGreen()
                                        + (endColor.getGreen() - startColor.getGreen()) * frac);
                int bBg =
                        Math.round(
                                startColor.getBlue()
                                        + (endColor.getBlue() - startColor.getBlue()) * frac);
                int bgVal = new Color(rBg, gBg, bBg).getRGB();
                int fgVal = image.getRGB(x, y);
                float alpha = d < featherRadius ? (float) d / featherRadius : 1.0f;
                int blended = blendColors(fgVal, bgVal, alpha);
                output.setRGB(x, y, blended);
            }
        }
        return output;
    }

    private int blendColors(int fg, int bg, float alpha) {
        int r = Math.round(((fg >> 16) & 0xFF) * alpha + ((bg >> 16) & 0xFF) * (1 - alpha));
        int g = Math.round(((fg >> 8) & 0xFF) * alpha + ((bg >> 8) & 0xFF) * (1 - alpha));
        int b = Math.round((fg & 0xFF) * alpha + (bg & 0xFF) * (1 - alpha));
        return (r << 16) | (g << 8) | b;
    }

    private BufferedImage applyGaussianBlur(BufferedImage image, double sigma) {
        if (sigma <= 0) {
            return image;
        }

        // Scale sigma based on image size to maintain consistent blur effect
        double scaledSigma = sigma * Math.min(image.getWidth(), image.getHeight()) / 1000.0;

        int radius = Math.max(1, (int) Math.ceil(scaledSigma * 3));
        int size = 2 * radius + 1;
        float[] data = new float[size * size];
        double sum = 0.0;

        // Generate Gaussian kernel
        for (int i = -radius; i <= radius; i++) {
            for (int j = -radius; j <= radius; j++) {
                double xDistance = (double) i * i;
                double yDistance = (double) j * j;
                double g = Math.exp(-(xDistance + yDistance) / (2 * scaledSigma * scaledSigma));
                data[(i + radius) * size + j + radius] = (float) g;
                sum += g;
            }
        }

        // Normalize kernel
        for (int i = 0; i < data.length; i++) {
            data[i] /= (float) sum;
        }

        // Create and apply convolution
        java.awt.image.Kernel kernel = new java.awt.image.Kernel(size, size, data);
        java.awt.image.ConvolveOp op =
                new java.awt.image.ConvolveOp(kernel, java.awt.image.ConvolveOp.EDGE_NO_OP, null);

        // Apply blur with high-quality rendering hints
        BufferedImage result =
                new BufferedImage(image.getWidth(), image.getHeight(), image.getType());
        Graphics2D g2d = result.createGraphics();
        g2d.setRenderingHint(
                RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2d.drawImage(op.filter(image, null), 0, 0, null);
        g2d.dispose();

        return result;
    }

    private void applyYellowishEffect(BufferedImage image) {
        for (int x = 0; x < image.getWidth(); x++) {
            for (int y = 0; y < image.getHeight(); y++) {
                int rgb = image.getRGB(x, y);
                int r = (rgb >> 16) & 0xFF;
                int g = (rgb >> 8) & 0xFF;
                int b = rgb & 0xFF;

                // Stronger yellow tint while preserving brightness
                float brightness = (r + g + b) / 765.0f; // Normalize to 0-1
                r = Math.min(255, (int) (r + (255 - r) * 0.18f * brightness));
                g = Math.min(255, (int) (g + (255 - g) * 0.12f * brightness));
                b = Math.max(0, (int) (b * (1 - 0.25f * brightness)));

                image.setRGB(x, y, (r << 16) | (g << 8) | b);
            }
        }
    }

    private void addGaussianNoise(BufferedImage image, double strength) {
        if (strength <= 0) return;

        // Scale noise based on image size
        double scaledStrength = strength * Math.min(image.getWidth(), image.getHeight()) / 1000.0;

        for (int x = 0; x < image.getWidth(); x++) {
            for (int y = 0; y < image.getHeight(); y++) {
                int rgb = image.getRGB(x, y);
                int r = (rgb >> 16) & 0xFF;
                int g = (rgb >> 8) & 0xFF;
                int b = rgb & 0xFF;

                // Generate noise with better distribution
                double noiseR = RANDOM.nextGaussian() * scaledStrength;
                double noiseG = RANDOM.nextGaussian() * scaledStrength;
                double noiseB = RANDOM.nextGaussian() * scaledStrength;

                // Apply noise with better color preservation
                r = Math.min(255, Math.max(0, r + (int) noiseR));
                g = Math.min(255, Math.max(0, g + (int) noiseG));
                b = Math.min(255, Math.max(0, b + (int) noiseB));

                image.setRGB(x, y, (r << 16) | (g << 8) | b);
            }
        }
    }

    private BufferedImage adjustBrightnessContrast(
            BufferedImage image, float brightness, float contrast) {
        BufferedImage output =
                new BufferedImage(image.getWidth(), image.getHeight(), image.getType());
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                int rgb = image.getRGB(x, y);
                int r = (int) (((((rgb >> 16) & 0xFF) - 128) * contrast + 128) * brightness);
                int g = (int) (((((rgb >> 8) & 0xFF) - 128) * contrast + 128) * brightness);
                int b = (int) ((((rgb & 0xFF) - 128) * contrast + 128) * brightness);
                r = Math.min(255, Math.max(0, r));
                g = Math.min(255, Math.max(0, g));
                b = Math.min(255, Math.max(0, b));
                output.setRGB(x, y, (r << 16) | (g << 8) | b);
            }
        }
        return output;
    }
}
