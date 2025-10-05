package stirling.software.SPDF.controller.api.misc;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferInt;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Queue;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ForkJoinPool;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

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

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.misc.ScannerEffectRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ApplicationContextProvider;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous PDF APIs")
@RequiredArgsConstructor
public class ScannerEffectController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private static final int MAX_IMAGE_WIDTH = 8192;
    private static final int MAX_IMAGE_HEIGHT = 8192;
    private static final long MAX_IMAGE_PIXELS = 16_777_216; // 4096x4096
    private static final long RENDER_CLONE_IN_MEMORY_THRESHOLD = 16 * 1024 * 1024; // 16 MB

    private static final ThreadLocal<BufferCache> BUFFER_CACHE =
            ThreadLocal.withInitial(BufferCache::new);

    private static int calculateSafeResolution(
            float pageWidthPts, float pageHeightPts, int resolution) {
        int projectedWidth = (int) Math.ceil(pageWidthPts * resolution / 72.0);
        int projectedHeight = (int) Math.ceil(pageHeightPts * resolution / 72.0);
        long projectedPixels = (long) projectedWidth * projectedHeight;

        if (projectedWidth <= MAX_IMAGE_WIDTH
                && projectedHeight <= MAX_IMAGE_HEIGHT
                && projectedPixels <= MAX_IMAGE_PIXELS) {
            return resolution;
        }

        double widthScale = (double) MAX_IMAGE_WIDTH / projectedWidth;
        double heightScale = (double) MAX_IMAGE_HEIGHT / projectedHeight;
        double pixelScale = Math.sqrt((double) MAX_IMAGE_PIXELS / projectedPixels);
        double minScale = Math.min(Math.min(widthScale, heightScale), pixelScale);

        return (int) Math.max(72, resolution * minScale);
    }

    private static int determineRenderResolution(ScannerEffectRequest request) {
        return request.getResolution();
    }

    private static BufferedImage renderPageSafely(PDFRenderer renderer, int pageIndex, int dpi)
            throws IOException {
        try {
            return renderer.renderImageWithDPI(pageIndex, dpi);
        } catch (OutOfMemoryError | NegativeArraySizeException e) {
            throw ExceptionUtils.createOutOfMemoryDpiException(pageIndex + 1, dpi, e);
        }
    }

    private static BufferedImage convertColorspace(
            BufferedImage image, ScannerEffectRequest.Colorspace colorspace) {
        BufferedImage result =
                new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D g = result.createGraphics();
        g.drawImage(image, 0, 0, null);
        g.dispose();

        if (colorspace == ScannerEffectRequest.Colorspace.grayscale) {
            convertToGrayscale(result);
        }

        return result;
    }

    private static void convertToGrayscale(BufferedImage image) {
        int[] pixels = ((DataBufferInt) image.getRaster().getDataBuffer()).getData();
        for (int i = 0; i < pixels.length; i++) {
            int rgb = pixels[i];
            int r = (rgb >> 16) & 0xFF;
            int g = (rgb >> 8) & 0xFF;
            int b = rgb & 0xFF;
            int gray = (r + g + b) / 3;
            pixels[i] = (gray << 16) | (gray << 8) | gray;
        }
    }

    private static GradientConfig createRandomGradient() {
        boolean vertical = ThreadLocalRandom.current().nextBoolean();
        float startGrey = 0.6f + 0.3f * ThreadLocalRandom.current().nextFloat();
        float endGrey = 0.6f + 0.3f * ThreadLocalRandom.current().nextFloat();

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

        return new GradientConfig(vertical, startColor, endColor);
    }

    private static BufferedImage addBorderWithGradient(
            BufferedImage image, int borderPx, GradientConfig gradient) {
        int width = image.getWidth() + 2 * borderPx;
        int height = image.getHeight() + 2 * borderPx;

        int[] gradientLUT = createGradientLUT(width, height, gradient);
        BufferedImage result = new BufferedImage(width, height, image.getType());
        int[] pixels = ((DataBufferInt) result.getRaster().getDataBuffer()).getData();

        fillWithGradient(pixels, width, height, gradientLUT, gradient.vertical);

        Graphics2D g = result.createGraphics();
        g.drawImage(image, borderPx, borderPx, null);
        g.dispose();

        return result;
    }

    private static int[] createGradientLUT(int width, int height, GradientConfig gradient) {
        int size = gradient.vertical ? height : width;
        int[] lut = new int[size];

        int rStart = gradient.startColor.getRed();
        int gStart = gradient.startColor.getGreen();
        int bStart = gradient.startColor.getBlue();
        int rDiff = gradient.endColor.getRed() - rStart;
        int gDiff = gradient.endColor.getGreen() - gStart;
        int bDiff = gradient.endColor.getBlue() - bStart;

        for (int i = 0; i < size; i++) {
            float frac = (float) i / Math.max(1, size - 1);
            int r = Math.round(rStart + rDiff * frac);
            int g = Math.round(gStart + gDiff * frac);
            int b = Math.round(bStart + bDiff * frac);
            lut[i] = (r << 16) | (g << 8) | b;
        }

        return lut;
    }

    private static void fillWithGradient(
            int[] pixels, int width, int height, int[] gradientLUT, boolean vertical) {
        if (vertical) {
            for (int y = 0; y < height; y++) {
                Arrays.fill(pixels, y * width, (y + 1) * width, gradientLUT[y]);
            }
        } else {
            for (int y = 0; y < height; y++) {
                System.arraycopy(gradientLUT, 0, pixels, y * width, width);
            }
        }
    }

    private static double calculateRotation(int baseRotation, int rotateVariance) {
        if (baseRotation == 0 && rotateVariance == 0) {
            return 0;
        }
        return baseRotation + (ThreadLocalRandom.current().nextDouble() * 2 - 1) * rotateVariance;
    }

    private static BufferedImage rotateImage(
            BufferedImage image, double rotation, GradientConfig gradient) {
        if (rotation == 0) {
            return image;
        }

        int w = image.getWidth();
        int h = image.getHeight();
        double radians = Math.toRadians(rotation);
        double sin = Math.abs(Math.sin(radians));
        double cos = Math.abs(Math.cos(radians));
        int rotW = (int) Math.floor(w * cos + h * sin);
        int rotH = (int) Math.floor(h * cos + w * sin);

        BufferedImage background = createRotatedBackground(rotW, rotH, image.getType(), gradient);
        BufferedImage result = new BufferedImage(rotW, rotH, image.getType());

        Graphics2D g = result.createGraphics();
        g.drawImage(background, 0, 0, null);

        AffineTransform transform = new AffineTransform();
        transform.translate((rotW - w) / 2.0, (rotH - h) / 2.0);
        transform.rotate(radians, w / 2.0, h / 2.0);

        g.setRenderingHint(
                RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.drawImage(image, transform, null);
        g.dispose();

        return result;
    }

    private static BufferedImage createRotatedBackground(
            int width, int height, int imageType, GradientConfig gradient) {
        BufferedImage background = new BufferedImage(width, height, imageType);
        int[] pixels = ((DataBufferInt) background.getRaster().getDataBuffer()).getData();
        int[] gradientLUT = createGradientLUT(width, height, gradient);
        fillWithGradient(pixels, width, height, gradientLUT, gradient.vertical);
        return background;
    }

    private static BufferedImage applyAllEffectsSinglePass(
            BufferedImage image,
            float brightness,
            float contrast,
            boolean yellowish,
            double noise) {
        int width = image.getWidth();
        int height = image.getHeight();
        BufferedImage output = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);

        int[] srcPixels = ((DataBufferInt) image.getRaster().getDataBuffer()).getData();
        int[] dstPixels = ((DataBufferInt) output.getRaster().getDataBuffer()).getData();

        double scaledStrength = noise * Math.min(width, height) / 1000.0;
        boolean applyNoise = scaledStrength > 0;
        float contrastOffset = 128.0f - 128.0f * contrast;
        float inv765 = 1.0f / 765.0f;
        for (int i = 0; i < srcPixels.length; i++) {
            int rgb = srcPixels[i];
            int r = (rgb >> 16) & 0xFF;
            int g = (rgb >> 8) & 0xFF;
            int b = rgb & 0xFF;

            r = (int) ((r * contrast + contrastOffset) * brightness);
            g = (int) ((g * contrast + contrastOffset) * brightness);
            b = (int) ((b * contrast + contrastOffset) * brightness);
            r = Math.min(255, Math.max(0, r));
            g = Math.min(255, Math.max(0, g));
            b = Math.min(255, Math.max(0, b));

            if (yellowish) {
                float bright = (r + g + b) * inv765;
                r = Math.min(255, (int) (r + (255 - r) * 0.18f * bright));
                g = Math.min(255, (int) (g + (255 - g) * 0.12f * bright));
                b = Math.max(0, (int) (b * (1.0f - 0.25f * bright)));
            }

            if (applyNoise) {
                r =
                        Math.min(
                                255,
                                Math.max(
                                        0,
                                        r
                                                + (int)
                                                        (ThreadLocalRandom.current().nextGaussian()
                                                                * scaledStrength)));
                g =
                        Math.min(
                                255,
                                Math.max(
                                        0,
                                        g
                                                + (int)
                                                        (ThreadLocalRandom.current().nextGaussian()
                                                                * scaledStrength)));
                b =
                        Math.min(
                                255,
                                Math.max(
                                        0,
                                        b
                                                + (int)
                                                        (ThreadLocalRandom.current().nextGaussian()
                                                                * scaledStrength)));
            }

            dstPixels[i] = (r << 16) | (g << 8) | b;
        }

        return output;
    }

    private static BufferedImage softenEdges(
            BufferedImage image,
            int featherRadius,
            Color startColor,
            Color endColor,
            boolean vertical) {
        int width = image.getWidth();
        int height = image.getHeight();
        BufferedImage output = new BufferedImage(width, height, image.getType());

        int[] srcPixels = ((DataBufferInt) image.getRaster().getDataBuffer()).getData();
        int[] dstPixels = ((DataBufferInt) output.getRaster().getDataBuffer()).getData();

        int[] gradientLUT =
                createGradientLUT(
                        width, height, new GradientConfig(vertical, startColor, endColor));
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int dx = Math.min(x, width - 1 - x);
                int dy = Math.min(y, height - 1 - y);
                int d = Math.min(dx, dy);

                int bgVal = gradientLUT[vertical ? y : x];
                int fgVal = srcPixels[y * width + x];

                float alpha = d < featherRadius ? (float) d / featherRadius : 1.0f;
                dstPixels[y * width + x] = blendColors(fgVal, bgVal, alpha);
            }
        }
        return output;
    }

    private static int blendColors(int fg, int bg, float alpha) {
        int r = Math.round(((fg >> 16) & 0xFF) * alpha + ((bg >> 16) & 0xFF) * (1 - alpha));
        int g = Math.round(((fg >> 8) & 0xFF) * alpha + ((bg >> 8) & 0xFF) * (1 - alpha));
        int b = Math.round((fg & 0xFF) * alpha + (bg & 0xFF) * (1 - alpha));
        return (r << 16) | (g << 8) | b;
    }

    private static BufferedImage applyGaussianBlur(BufferedImage image, double sigma) {
        if (sigma <= 0) {
            return image;
        }

        double scaledSigma = sigma * Math.min(image.getWidth(), image.getHeight()) / 1000.0;
        int radius = Math.max(1, (int) Math.ceil(scaledSigma * 2));
        int width = image.getWidth();
        int height = image.getHeight();
        int pixelCount = width * height;

        int[] srcPixels = ((DataBufferInt) image.getRaster().getDataBuffer()).getData();
        BufferCache cache = BUFFER_CACHE.get();
        int[] tempPixels = cache.getTempBuffer(pixelCount);
        int[] dstPixels = cache.getDstBuffer(pixelCount);

        System.arraycopy(srcPixels, 0, tempPixels, 0, pixelCount);

        for (int pass = 0; pass < 2; pass++) {
            boxBlurHorizontal(tempPixels, dstPixels, width, height, radius);
            boxBlurVertical(dstPixels, tempPixels, width, height, radius);
        }

        BufferedImage result = new BufferedImage(width, height, image.getType());
        int[] resultPixels = ((DataBufferInt) result.getRaster().getDataBuffer()).getData();
        System.arraycopy(tempPixels, 0, resultPixels, 0, pixelCount);

        return result;
    }

    private static void boxBlurHorizontal(int[] src, int[] dst, int width, int height, int radius) {
        int diameter = radius * 2 + 1;
        float invDiameter = 1.0f / diameter;

        for (int y = 0; y < height; y++) {
            int rowStart = y * width;
            int sumR = 0, sumG = 0, sumB = 0;

            for (int x = -radius; x <= radius; x++) {
                int px = Math.max(0, Math.min(width - 1, x));
                int rgb = src[rowStart + px];
                sumR += (rgb >> 16) & 0xFF;
                sumG += (rgb >> 8) & 0xFF;
                sumB += rgb & 0xFF;
            }

            for (int x = 0; x < width; x++) {
                int r = (int) (sumR * invDiameter);
                int g = (int) (sumG * invDiameter);
                int b = (int) (sumB * invDiameter);
                dst[rowStart + x] = (r << 16) | (g << 8) | b;

                int leftX = Math.max(0, x - radius);
                int rightX = Math.min(width - 1, x + radius + 1);

                int leftRgb = src[rowStart + leftX];
                int rightRgb = src[rowStart + rightX];

                sumR += ((rightRgb >> 16) & 0xFF) - ((leftRgb >> 16) & 0xFF);
                sumG += ((rightRgb >> 8) & 0xFF) - ((leftRgb >> 8) & 0xFF);
                sumB += (rightRgb & 0xFF) - (leftRgb & 0xFF);
            }
        }
    }

    private static void boxBlurVertical(int[] src, int[] dst, int width, int height, int radius) {
        int diameter = radius * 2 + 1;
        float invDiameter = 1.0f / diameter;

        for (int x = 0; x < width; x++) {
            int sumR = 0, sumG = 0, sumB = 0;

            for (int y = -radius; y <= radius; y++) {
                int py = Math.max(0, Math.min(height - 1, y));
                int rgb = src[py * width + x];
                sumR += (rgb >> 16) & 0xFF;
                sumG += (rgb >> 8) & 0xFF;
                sumB += rgb & 0xFF;
            }

            for (int y = 0; y < height; y++) {
                int r = (int) (sumR * invDiameter);
                int g = (int) (sumG * invDiameter);
                int b = (int) (sumB * invDiameter);
                dst[y * width + x] = (r << 16) | (g << 8) | b;

                int topY = Math.max(0, y - radius);
                int bottomY = Math.min(height - 1, y + radius + 1);

                int topRgb = src[topY * width + x];
                int bottomRgb = src[bottomY * width + x];

                sumR += ((bottomRgb >> 16) & 0xFF) - ((topRgb >> 16) & 0xFF);
                sumG += ((bottomRgb >> 8) & 0xFF) - ((topRgb >> 8) & 0xFF);
                sumB += (bottomRgb & 0xFF) - (topRgb & 0xFF);
            }
        }
    }

    private static void writeProcessedPagesToDocument(
            List<ProcessedPage> pages, PDDocument document) throws IOException {
        for (ProcessedPage page : pages) {
            PDPage newPage = new PDPage(new PDRectangle(page.origW, page.origH));
            document.addPage(newPage);

            try (PDPageContentStream contentStream = new PDPageContentStream(document, newPage)) {
                PDImageXObject pdImage = LosslessFactory.createFromImage(document, page.image);
                contentStream.drawImage(
                        pdImage, page.offsetX, page.offsetY, page.drawW, page.drawH);
            }

            page.image.flush();
        }
    }

    private static ProcessedPage processPage(
            int pageIndex,
            RenderingResources renderingResources,
            int baseRotation,
            int rotateVariance,
            int borderPx,
            float brightness,
            float contrast,
            float blur,
            float noise,
            boolean yellowish,
            int renderResolution,
            ScannerEffectRequest.Colorspace colorspace) {

        try {
            PDRectangle pageSize = renderingResources.getPageMediaBox(pageIndex);
            float pageWidthPts = pageSize.getWidth();
            float pageHeightPts = pageSize.getHeight();

            int safeResolution =
                    calculateSafeResolution(pageWidthPts, pageHeightPts, renderResolution);

            BufferedImage image = renderingResources.renderPage(pageIndex, safeResolution);
            BufferedImage processed = convertColorspace(image, colorspace);
            image.flush();

            GradientConfig gradient = createRandomGradient();
            BufferedImage composed = addBorderWithGradient(processed, borderPx, gradient);
            processed.flush();

            double rotation = calculateRotation(baseRotation, rotateVariance);
            BufferedImage rotated = rotateImage(composed, rotation, gradient);

            if (rotated != composed) {
                composed.flush();
            }

            // Reuse the pageSize we already retrieved to avoid redundant document access
            float origW = pageSize.getWidth();
            float origH = pageSize.getHeight();

            int rotW = rotated.getWidth();
            int rotH = rotated.getHeight();
            float scale = Math.max(origW / rotW, origH / rotH);
            float drawW = rotW * scale;
            float drawH = rotH * scale;
            float offsetX = (origW - drawW) / 2f;
            float offsetY = (origH - drawH) / 2f;

            int featherRadius = Math.max(10, Math.round(Math.min(rotW, rotH) * 0.02f));
            BufferedImage softened =
                    softenEdges(
                            rotated,
                            featherRadius,
                            gradient.startColor,
                            gradient.endColor,
                            gradient.vertical);

            BufferedImage blurred = applyGaussianBlur(softened, blur);
            BufferedImage adjusted =
                    applyAllEffectsSinglePass(blurred, brightness, contrast, yellowish, noise);

            softened.flush();
            blurred.flush();

            if (rotated != composed) {
                rotated.flush();
            }
            return new ProcessedPage(adjusted, origW, origH, offsetX, offsetY, drawW, drawH);
        } catch (IOException e) {
            throw new RuntimeException("Failed to process page " + (pageIndex + 1), e);
        } catch (OutOfMemoryError | NegativeArraySizeException e) {
            throw ExceptionUtils.createOutOfMemoryDpiException(pageIndex + 1, renderResolution, e);
        }
    }

    @PostMapping(value = "/scanner-effect", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Apply scanner effect to PDF",
            description =
                    "Applies various effects to simulate a scanned document, including rotation, noise, and edge softening. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> scannerEffect(@Valid @ModelAttribute ScannerEffectRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();

        List<Path> tempFiles = new ArrayList<>();
        Path processingInput;

        try {
            Path originalInput = Files.createTempFile("scanner_effect_input_", ".pdf");
            tempFiles.add(originalInput);
            file.transferTo(originalInput.toFile());

            processingInput = originalInput;

            if (!request.isAdvancedEnabled()) {
                switch (request.getQuality()) {
                    case high -> request.applyHighQualityPreset();
                    case medium -> request.applyMediumQualityPreset();
                    case low -> request.applyLowQualityPreset();
                }
            }

            int baseRotation = request.getRotationValue() + request.getRotate();
            int rotateVariance = request.getRotateVariance();
            int borderPx = request.getBorder();
            float brightness = request.getBrightness();
            float contrast = request.getContrast();
            float blur = request.getBlur();
            float noise = request.getNoise();
            boolean yellowish = request.isYellowish();
            int resolution = request.getResolution();
            int renderResolution = determineRenderResolution(request);
            ScannerEffectRequest.Colorspace colorspace = request.getColorspace();

            long inputFileSize = Files.size(processingInput);
            byte[] renderingPdfBytes = null;
            if (inputFileSize <= RENDER_CLONE_IN_MEMORY_THRESHOLD) {
                renderingPdfBytes = Files.readAllBytes(processingInput);
            }

            final byte[] sharedPdfBytes = renderingPdfBytes;
            final Path sharedPdfPath = sharedPdfBytes == null ? processingInput : null;

            int maxSafeDpi = 500; // Default maximum safe DPI
            ApplicationProperties properties =
                    ApplicationContextProvider.getBean(ApplicationProperties.class);
            if (properties != null && properties.getSystem() != null) {
                maxSafeDpi = properties.getSystem().getMaxDPI();
            }
            if (resolution > maxSafeDpi) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.dpiExceedsLimit",
                        "DPI value {0} exceeds maximum safe limit of {1}. High DPI values can cause"
                                + " memory issues and crashes. Please use a lower DPI value.",
                        resolution,
                        maxSafeDpi);
            }

            try (PDDocument document =
                            sharedPdfBytes != null
                                    ? pdfDocumentFactory.load(sharedPdfBytes)
                                    : pdfDocumentFactory.load(processingInput);
                    PDDocument outputDocument = new PDDocument()) {

                int totalPages = document.getNumberOfPages();
                if (totalPages == 0) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.emptyDocument",
                            "The provided PDF contains no pages to process.");
                }
                int configuredParallelism =
                        Math.min(64, Math.max(2, Runtime.getRuntime().availableProcessors() * 2));
                int desiredParallelism = Math.max(1, Math.min(totalPages, configuredParallelism));

                try (ManagedForkJoinPool managedPool =
                        new ManagedForkJoinPool(desiredParallelism)) {
                    ForkJoinPool customPool = managedPool.getPool();

                    Queue<RenderingResources> renderingResourcesToClose =
                            new ConcurrentLinkedQueue<>();
                    ThreadLocal<RenderingResources> renderingResources =
                            ThreadLocal.withInitial(
                                    () -> {
                                        try {
                                            RenderingResources resources =
                                                    sharedPdfBytes != null
                                                            ? RenderingResources.fromBytes(
                                                                    pdfDocumentFactory,
                                                                    sharedPdfBytes)
                                                            : RenderingResources.fromPath(
                                                                    pdfDocumentFactory,
                                                                    sharedPdfPath);
                                            renderingResourcesToClose.add(resources);
                                            return resources;
                                        } catch (IOException e) {
                                            throw new UncheckedIOException(
                                                    "Failed to prepare rendering resources", e);
                                        }
                                    });
                    List<ProcessedPage> processedPages;
                    try {
                        List<Callable<ProcessedPage>> tasks =
                                IntStream.range(0, totalPages)
                                        .mapToObj(
                                                i ->
                                                        (Callable<ProcessedPage>)
                                                                () ->
                                                                        processPage(
                                                                                i,
                                                                                renderingResources
                                                                                        .get(),
                                                                                baseRotation,
                                                                                rotateVariance,
                                                                                borderPx,
                                                                                brightness,
                                                                                contrast,
                                                                                blur,
                                                                                noise,
                                                                                yellowish,
                                                                                renderResolution,
                                                                                colorspace))
                                        .toList();

                        List<Future<ProcessedPage>> futures = customPool.invokeAll(tasks);
                        processedPages = new ArrayList<>(totalPages);
                        for (Future<ProcessedPage> future : futures) {
                            processedPages.add(future.get());
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new IOException("Parallel page processing interrupted", e);
                    } catch (ExecutionException e) {
                        throw new IOException("Parallel page processing failed", e.getCause());
                    } finally {
                        renderingResources.remove();
                        for (RenderingResources resources : renderingResourcesToClose) {
                            resources.closeQuietly();
                        }
                    }

                    writeProcessedPagesToDocument(processedPages, outputDocument);

                    ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                    outputDocument.save(outputStream);

                    return WebResponseUtils.bytesToWebResponse(
                            outputStream.toByteArray(),
                            GeneralUtils.generateFilename(
                                    file.getOriginalFilename(), "_scanner_effect.pdf"));
                }
            }
        } finally {
            for (Path tempFile : tempFiles) {
                try {
                    Files.deleteIfExists(tempFile);
                } catch (IOException e) {
                    // Ignore cleanup failures
                }
            }
        }
    }

    private static final class RenderingResources implements AutoCloseable {
        private final PDDocument document;
        private final PDFRenderer renderer;

        private RenderingResources(PDDocument document) {
            this.document = document;
            this.renderer = new PDFRenderer(document);
            this.renderer.setSubsamplingAllowed(true);
            this.renderer.setImageDownscalingOptimizationThreshold(0.5f);
        }

        static RenderingResources fromBytes(CustomPDFDocumentFactory factory, byte[] pdfBytes)
                throws IOException {
            return new RenderingResources(factory.load(pdfBytes, true));
        }

        static RenderingResources fromPath(CustomPDFDocumentFactory factory, Path pdfPath)
                throws IOException {
            return new RenderingResources(factory.load(pdfPath, true));
        }

        PDRectangle getPageMediaBox(int pageIndex) {
            return document.getPage(pageIndex).getMediaBox();
        }

        BufferedImage renderPage(int pageIndex, int dpi) throws IOException {
            return renderPageSafely(renderer, pageIndex, dpi);
        }

        @Override
        public void close() throws IOException {
            document.close();
        }

        void closeQuietly() {
            try {
                close();
            } catch (IOException e) {
                // Ignore close failure
            }
        }
    }

    private static class BufferCache {
        int[] tempPixels = new int[0];
        int[] dstPixels = new int[0];

        int[] getTempBuffer(int requiredSize) {
            if (tempPixels.length < requiredSize) {
                tempPixels = new int[requiredSize];
            }
            return tempPixels;
        }

        int[] getDstBuffer(int requiredSize) {
            if (dstPixels.length < requiredSize) {
                dstPixels = new int[requiredSize];
            }
            return dstPixels;
        }
    }

    private static class ManagedForkJoinPool implements AutoCloseable {
        private final ForkJoinPool pool;

        ManagedForkJoinPool(int parallelism) {
            this.pool = new ForkJoinPool(parallelism);
        }

        ForkJoinPool getPool() {
            return pool;
        }

        @Override
        public void close() {
            pool.shutdown();
            try {
                if (!pool.awaitTermination(60, TimeUnit.SECONDS)) {
                    pool.shutdownNow();
                    if (!pool.awaitTermination(60, TimeUnit.SECONDS)) {
                        throw new RuntimeException("ForkJoinPool did not terminate");
                    }
                }
            } catch (InterruptedException e) {
                pool.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
    }

    private record GradientConfig(boolean vertical, Color startColor, Color endColor) {}

    private static class ProcessedPage {
        final BufferedImage image;
        final float origW, origH, offsetX, offsetY, drawW, drawH;

        ProcessedPage(
                BufferedImage image,
                float origW,
                float origH,
                float offsetX,
                float offsetY,
                float drawW,
                float drawH) {
            this.image = image;
            this.origW = origW;
            this.origH = origH;
            this.offsetX = offsetX;
            this.offsetY = offsetY;
            this.drawW = drawW;
            this.drawH = drawH;
        }
    }
}
