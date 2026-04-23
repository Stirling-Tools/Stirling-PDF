package stirling.software.SPDF.service.pdfjson;

import java.awt.geom.AffineTransform;
import java.awt.geom.Point2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

import javax.imageio.ImageIO;

import org.apache.pdfbox.contentstream.PDFGraphicsStreamEngine;
import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.contentstream.operator.OperatorName;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.graphics.image.PDImage;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.util.Matrix;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.PdfJsonConversionProgress;
import stirling.software.SPDF.model.json.PdfJsonImageElement;

/**
 * Service for handling PDF image operations for JSON conversion (extraction, encoding, rendering).
 */
@Service
@Slf4j
public class PdfJsonImageService {

    private record EncodedImage(String base64, String format) {}

    private record Bounds(float left, float right, float bottom, float top) {
        float width() {
            return Math.max(0f, right - left);
        }

        float height() {
            return Math.max(0f, top - bottom);
        }
    }

    /**
     * Collects images from all pages in a PDF document.
     *
     * @param document The PDF document
     * @param totalPages Total number of pages
     * @param progress Progress callback
     * @return Map of page number to list of image elements
     * @throws IOException If image extraction fails
     */
    public Map<Integer, List<PdfJsonImageElement>> collectImages(
            PDDocument document, int totalPages, Consumer<PdfJsonConversionProgress> progress)
            throws IOException {
        Map<Integer, List<PdfJsonImageElement>> imagesByPage = new LinkedHashMap<>();
        Map<COSBase, EncodedImage> imageCache = new IdentityHashMap<>();
        int pageNumber = 1;
        for (PDPage page : document.getPages()) {
            ImageCollectingEngine engine =
                    new ImageCollectingEngine(page, pageNumber, imagesByPage, imageCache);
            engine.processPage(page);

            // Update progress for image extraction (70-80%)
            int imageProgress = 70 + (int) ((pageNumber / (double) totalPages) * 10);
            progress.accept(
                    PdfJsonConversionProgress.of(
                            imageProgress, "images", "Extracting images", pageNumber, totalPages));
            pageNumber++;
        }
        return imagesByPage;
    }

    /**
     * Extracts images from a single PDF page (for on-demand lazy loading).
     *
     * @param document The PDF document
     * @param page The specific page to extract images from
     * @param pageNumber The page number (1-indexed)
     * @return List of image elements for this page
     * @throws IOException If image extraction fails
     */
    public List<PdfJsonImageElement> extractImagesForPage(
            PDDocument document, PDPage page, int pageNumber) throws IOException {
        Map<Integer, List<PdfJsonImageElement>> imagesByPage = new LinkedHashMap<>();
        ImageCollectingEngine engine =
                new ImageCollectingEngine(page, pageNumber, imagesByPage, new IdentityHashMap<>());
        engine.processPage(page);
        return imagesByPage.getOrDefault(pageNumber, new ArrayList<>());
    }

    /**
     * Draws an image element on a PDF page content stream.
     *
     * @param contentStream The content stream to draw on
     * @param document The PDF document
     * @param element The image element to draw
     * @param cache Cache of previously created image XObjects
     * @throws IOException If drawing fails
     */
    public void drawImageElement(
            PDPageContentStream contentStream,
            PDDocument document,
            PdfJsonImageElement element,
            Map<String, PDImageXObject> cache)
            throws IOException {
        if (element == null || element.getImageData() == null || element.getImageData().isBlank()) {
            return;
        }

        String cacheKey =
                element.getId() != null && !element.getId().isBlank()
                        ? element.getId()
                        : Integer.toHexString(System.identityHashCode(element));
        PDImageXObject image = cache.get(cacheKey);
        if (image == null) {
            image = createImageXObject(document, element);
            if (image == null) {
                return;
            }
            cache.put(cacheKey, image);
        }

        float[] transform = element.getTransform();
        if (transform != null && transform.length == 6) {
            Matrix matrix =
                    new Matrix(
                            safeFloat(transform[0], 1f),
                            safeFloat(transform[1], 0f),
                            safeFloat(transform[2], 0f),
                            safeFloat(transform[3], 1f),
                            safeFloat(transform[4], 0f),
                            safeFloat(transform[5], 0f));
            contentStream.drawImage(image, matrix);
            return;
        }

        float width = safeFloat(element.getWidth(), fallbackWidth(element));
        float height = safeFloat(element.getHeight(), fallbackHeight(element));
        if (width <= 0f) {
            width = Math.max(1f, fallbackWidth(element));
        }
        if (height <= 0f) {
            height = Math.max(1f, fallbackHeight(element));
        }
        float left = resolveLeft(element, width);
        float bottom = resolveBottom(element, height);

        contentStream.drawImage(image, left, bottom, width, height);
    }

    /**
     * Creates a PDImageXObject from a PdfJsonImageElement.
     *
     * @param document The PDF document
     * @param element The image element with base64 data
     * @return The created image XObject
     * @throws IOException If image creation fails
     */
    public PDImageXObject createImageXObject(PDDocument document, PdfJsonImageElement element)
            throws IOException {
        byte[] data;
        try {
            data = Base64.getDecoder().decode(element.getImageData());
        } catch (IllegalArgumentException ex) {
            log.debug("Failed to decode image element: {}", ex.getMessage());
            return null;
        }
        String name = element.getId() != null ? element.getId() : UUID.randomUUID().toString();
        return PDImageXObject.createFromByteArray(document, data, name);
    }

    private EncodedImage encodeImage(PDImage image) {
        try {
            BufferedImage bufferedImage = image.getImage();
            if (bufferedImage == null) {
                return null;
            }
            String format = resolveImageFormat(image);
            if (format == null || format.isBlank()) {
                format = "png";
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            boolean written = ImageIO.write(bufferedImage, format, baos);
            if (!written) {
                if (!"png".equalsIgnoreCase(format)) {
                    baos.reset();
                    if (!ImageIO.write(bufferedImage, "png", baos)) {
                        return null;
                    }
                    format = "png";
                } else {
                    return null;
                }
            }
            return new EncodedImage(Base64.getEncoder().encodeToString(baos.toByteArray()), format);
        } catch (IOException ex) {
            log.debug("Failed to encode image: {}", ex.getMessage());
            return null;
        }
    }

    private String resolveImageFormat(PDImage image) {
        if (image instanceof PDImageXObject xObject) {
            String suffix = xObject.getSuffix();
            if (suffix != null && !suffix.isBlank()) {
                return suffix.toLowerCase(Locale.ROOT);
            }
        }
        return "png";
    }

    private float fallbackWidth(PdfJsonImageElement element) {
        if (element.getRight() != null && element.getLeft() != null) {
            return Math.max(0f, element.getRight() - element.getLeft());
        }
        if (element.getNativeWidth() != null) {
            return element.getNativeWidth();
        }
        return 1f;
    }

    private float fallbackHeight(PdfJsonImageElement element) {
        if (element.getTop() != null && element.getBottom() != null) {
            return Math.max(0f, element.getTop() - element.getBottom());
        }
        if (element.getNativeHeight() != null) {
            return element.getNativeHeight();
        }
        return 1f;
    }

    private float resolveLeft(PdfJsonImageElement element, float width) {
        if (element.getLeft() != null) {
            return element.getLeft();
        }
        if (element.getX() != null) {
            return element.getX();
        }
        if (element.getRight() != null) {
            return element.getRight() - width;
        }
        return 0f;
    }

    private float resolveBottom(PdfJsonImageElement element, float height) {
        if (element.getBottom() != null) {
            return element.getBottom();
        }
        if (element.getY() != null) {
            return element.getY();
        }
        if (element.getTop() != null) {
            return element.getTop() - height;
        }
        return 0f;
    }

    private float[] toMatrixValues(Matrix matrix) {
        return new float[] {
            matrix.getValue(0, 0),
            matrix.getValue(0, 1),
            matrix.getValue(1, 0),
            matrix.getValue(1, 1),
            matrix.getValue(2, 0),
            matrix.getValue(2, 1)
        };
    }

    private static float safeFloat(Float value, float defaultValue) {
        if (value == null || Float.isNaN(value) || Float.isInfinite(value)) {
            return defaultValue;
        }
        return value;
    }

    /**
     * Inner engine that extends PDFGraphicsStreamEngine to collect images from PDF content streams.
     */
    private class ImageCollectingEngine extends PDFGraphicsStreamEngine {

        private final int pageNumber;
        private final Map<Integer, List<PdfJsonImageElement>> imagesByPage;
        private final Map<COSBase, EncodedImage> imageCache;

        private COSName currentXObjectName;
        private int imageCounter = 0;

        protected ImageCollectingEngine(
                PDPage page,
                int pageNumber,
                Map<Integer, List<PdfJsonImageElement>> imagesByPage,
                Map<COSBase, EncodedImage> imageCache)
                throws IOException {
            super(page);
            this.pageNumber = pageNumber;
            this.imagesByPage = imagesByPage;
            this.imageCache = imageCache;
        }

        @Override
        public void processPage(PDPage page) throws IOException {
            super.processPage(page);
        }

        @Override
        public void drawImage(PDImage pdImage) throws IOException {
            EncodedImage encoded = getOrEncodeImage(pdImage);
            if (encoded == null) {
                return;
            }
            Matrix ctm = getGraphicsState().getCurrentTransformationMatrix();
            Bounds bounds = computeBounds(ctm);
            float[] matrixValues = toMatrixValues(ctm);

            PdfJsonImageElement element =
                    PdfJsonImageElement.builder()
                            .id(UUID.randomUUID().toString())
                            .objectName(
                                    currentXObjectName != null
                                            ? currentXObjectName.getName()
                                            : null)
                            .inlineImage(!(pdImage instanceof PDImageXObject))
                            .nativeWidth(pdImage.getWidth())
                            .nativeHeight(pdImage.getHeight())
                            .x(bounds.left)
                            .y(bounds.bottom)
                            .width(bounds.width())
                            .height(bounds.height())
                            .left(bounds.left)
                            .right(bounds.right)
                            .top(bounds.top)
                            .bottom(bounds.bottom)
                            .transform(matrixValues)
                            .zOrder(-1_000_000 + imageCounter)
                            .imageData(encoded.base64())
                            .imageFormat(encoded.format())
                            .build();
            imageCounter++;
            imagesByPage.computeIfAbsent(pageNumber, key -> new ArrayList<>()).add(element);
        }

        @Override
        public void appendRectangle(Point2D p0, Point2D p1, Point2D p2, Point2D p3)
                throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void clip(int windingRule) throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void moveTo(float x, float y) throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void lineTo(float x, float y) throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void curveTo(float x1, float y1, float x2, float y2, float x3, float y3)
                throws IOException {
            // Not needed for image extraction
        }

        @Override
        public Point2D getCurrentPoint() throws IOException {
            return new Point2D.Float();
        }

        @Override
        public void closePath() throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void endPath() throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void shadingFill(COSName shadingName) throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void fillAndStrokePath(int windingRule) throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void fillPath(int windingRule) throws IOException {
            // Not needed for image extraction
        }

        @Override
        public void strokePath() throws IOException {
            // Not needed for image extraction
        }

        @Override
        protected void processOperator(Operator operator, List<COSBase> operands)
                throws IOException {
            if (OperatorName.DRAW_OBJECT.equals(operator.getName())
                    && !operands.isEmpty()
                    && operands.get(0) instanceof COSName name) {
                currentXObjectName = name;
            }
            super.processOperator(operator, operands);
            currentXObjectName = null;
        }

        private EncodedImage getOrEncodeImage(PDImage pdImage) {
            if (pdImage == null) {
                return null;
            }
            if (pdImage instanceof PDImageXObject xObject) {
                if (xObject.isStencil()) {
                    return encodeImage(pdImage);
                }
                COSBase key = xObject.getCOSObject();
                EncodedImage cached = imageCache.get(key);
                if (cached != null) {
                    return cached;
                }
                EncodedImage encoded = encodeImage(pdImage);
                if (encoded != null) {
                    imageCache.put(key, encoded);
                }
                return encoded;
            }
            return encodeImage(pdImage);
        }

        private Bounds computeBounds(Matrix ctm) {
            AffineTransform transform = ctm.createAffineTransform();
            Point2D.Float p0 = new Point2D.Float(0, 0);
            Point2D.Float p1 = new Point2D.Float(1, 0);
            Point2D.Float p2 = new Point2D.Float(0, 1);
            Point2D.Float p3 = new Point2D.Float(1, 1);
            transform.transform(p0, p0);
            transform.transform(p1, p1);
            transform.transform(p2, p2);
            transform.transform(p3, p3);

            float minX = Math.min(Math.min(p0.x, p1.x), Math.min(p2.x, p3.x));
            float maxX = Math.max(Math.max(p0.x, p1.x), Math.max(p2.x, p3.x));
            float minY = Math.min(Math.min(p0.y, p1.y), Math.min(p2.y, p3.y));
            float maxY = Math.max(Math.max(p0.y, p1.y), Math.max(p2.y, p3.y));

            if (!Float.isFinite(minX) || !Float.isFinite(minY)) {
                return new Bounds(0f, 0f, 0f, 0f);
            }
            return new Bounds(minX, maxX, minY, maxY);
        }
    }
}
