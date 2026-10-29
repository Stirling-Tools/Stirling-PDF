package stirling.software.common.util;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.awt.image.RenderedImage;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.*;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageContentStream.AppendMode;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;

@Slf4j
@UtilityClass
public class PdfUtils {

    // Print-quality raster for flattening a page to an image; capped by system maxDPI
    private static final int PDF_TO_IMAGE_DPI = 300;

    // The stacked image keeps one int per pixel, and a JVM array stops just short of 2^31
    private static final long MAX_STACKED_IMAGE_PIXELS = Integer.MAX_VALUE - 8;

    private final RegexPatternUtils patternCache = RegexPatternUtils.getInstance();

    public PDRectangle textToPageSize(String size) {

        return switch (size.toUpperCase(Locale.ROOT)) {
            case "A0" -> PDRectangle.A0;
            case "A1" -> PDRectangle.A1;
            case "A2" -> PDRectangle.A2;
            case "A3" -> PDRectangle.A3;
            case "A4" -> PDRectangle.A4;
            case "A5" -> PDRectangle.A5;
            case "A6" -> PDRectangle.A6;
            case "LETTER" -> PDRectangle.LETTER;
            case "LEGAL" -> PDRectangle.LEGAL;
            default -> throw ExceptionUtils.createInvalidPageSizeException(size);
        };
    }

    /**
     * Collects the images reachable from {@code resources}, searching each resources dictionary
     * once. A form XObject can be named any number of times, so a walk that follows every name
     * grows with the number of paths, not the number of objects.
     */
    public List<RenderedImage> getAllImages(PDResources resources) throws IOException {
        List<RenderedImage> images = new ArrayList<>();
        collectImages(resources, images, Collections.newSetFromMap(new IdentityHashMap<>()));
        return images;
    }

    private void collectImages(
            PDResources resources, List<RenderedImage> images, Set<COSDictionary> visited)
            throws IOException {
        if (resources == null || !visited.add(resources.getCOSObject())) {
            return;
        }
        for (COSName name : resources.getXObjectNames()) {
            PDXObject object = resources.getXObject(name);
            if (object instanceof PDImageXObject image) {
                images.add(image.getImage());
            } else if (object instanceof PDFormXObject form) {
                collectImages(form.getResources(), images, visited);
            }
        }
    }

    private boolean containsImage(PDResources resources, Set<COSDictionary> visited)
            throws IOException {
        if (resources == null || !visited.add(resources.getCOSObject())) {
            return false;
        }
        for (COSName name : resources.getXObjectNames()) {
            if (resources.isImageXObject(name)) {
                return true;
            }
            if (resources.getXObject(name) instanceof PDFormXObject form
                    && containsImage(form.getResources(), visited)) {
                return true;
            }
        }
        return false;
    }

    public boolean hasImages(PDDocument document, String pagesToCheck) throws IOException {
        String[] pageOrderArr = pagesToCheck.split(",");
        List<Integer> pageList =
                GeneralUtils.parsePageList(pageOrderArr, document.getNumberOfPages());

        for (int pageNumber : pageList) {
            PDPage page = document.getPage(pageNumber);
            if (hasImagesOnPage(page)) {
                return true;
            }
        }

        return false;
    }

    public boolean hasText(PDDocument document, String pageNumbersToCheck, String phrase)
            throws IOException {
        String[] pageOrderArr = pageNumbersToCheck.split(",");
        List<Integer> pageList =
                GeneralUtils.parsePageList(pageOrderArr, document.getNumberOfPages());

        for (int pageNumber : pageList) {
            PDPage page = document.getPage(pageNumber);
            if (hasTextOnPage(page, phrase)) {
                return true;
            }
        }

        return false;
    }

    public boolean hasImagesOnPage(PDPage page) throws IOException {
        return containsImage(
                page.getResources(), Collections.newSetFromMap(new IdentityHashMap<>()));
    }

    public boolean hasTextOnPage(PDPage page, String phrase) throws IOException {
        PDFTextStripper textStripper = new PDFTextStripper();
        try (PDDocument tempDoc = new PDDocument()) {
            tempDoc.addPage(page);
            String pageText = textStripper.getText(tempDoc);
            return pageText.contains(phrase);
        }
    }

    /**
     * Renders the pages to a temp file (one image, or a zip of one per page) rather than memory,
     * since the output can pass 2 GB. The caller must close it or hand it to {@link
     * WebResponseUtils#fileToWebResponse}; on failure it is already deleted.
     */
    public TempFile convertFromPdf(
            CustomPDFDocumentFactory pdfDocumentFactory,
            TempFileManager tempFileManager,
            byte[] inputStream,
            String imageType,
            ImageType colorType,
            boolean singleImage,
            int DPI,
            String filename,
            boolean includeAnnotations)
            throws IOException {

        // Validate and limit DPI to prevent excessive memory usage
        int maxSafeDpi = 500; // Default maximum safe DPI
        ApplicationProperties properties =
                ApplicationContextProvider.getBean(ApplicationProperties.class);
        if (properties != null && properties.getSystem() != null) {
            maxSafeDpi = properties.getSystem().getMaxDPI();
        }
        if (DPI > maxSafeDpi) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.dpiExceedsLimit",
                    "DPI value {0} exceeds maximum safe limit of {1}. High DPI values can cause"
                            + " memory issues and crashes. Please use a lower DPI value.",
                    DPI,
                    maxSafeDpi);
        }

        String extension = imageType.toLowerCase(Locale.ROOT);
        boolean tiff = "tiff".equals(extension) || "tif".equals(extension);
        TempFile output =
                tempFileManager.createManagedTempFile(singleImage ? "." + extension : ".zip");
        boolean complete = false;
        try (PDDocument document = pdfDocumentFactory.load(inputStream)) {
            PDFRenderer pdfRenderer = new PDFRenderer(document);
            pdfRenderer.setSubsamplingAllowed(true);
            if (!includeAnnotations) {
                pdfRenderer.setAnnotationsFilter(annotation -> false);
            }

            if (singleImage && tiff) {
                writeTiffSequence(document, pdfRenderer, colorType, DPI, output.getFile());
            } else {
                try (OutputStream out =
                        new BufferedOutputStream(Files.newOutputStream(output.getPath()))) {
                    if (singleImage) {
                        writeStackedImage(document, pdfRenderer, imageType, colorType, DPI, out);
                    } else {
                        writeImageZip(
                                document, pdfRenderer, imageType, colorType, DPI, filename, out);
                    }
                }
            }
            complete = true;
            return output;
        } catch (IOException e) {
            log.error("Error converting PDF to image", e);
            throw e;
        } finally {
            if (!complete) {
                output.close();
            }
        }
    }

    private void writeTiffSequence(
            PDDocument document, PDFRenderer pdfRenderer, ImageType colorType, int DPI, File out)
            throws IOException {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("tiff").next();
        try {
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionType("ZLib");
            param.setCompressionQuality(1.0f);

            // A file-backed stream, because the TIFF writer seeks back to patch frame offsets
            try (ImageOutputStream ios = ImageIO.createImageOutputStream(out)) {
                writer.setOutput(ios);
                writer.prepareWriteSequence(null);
                for (int i = 0; i < document.getNumberOfPages(); ++i) {
                    BufferedImage image = renderPage(document, pdfRenderer, i, DPI, colorType);
                    writer.writeToSequence(new IIOImage(image, null, null), param);
                }
                writer.endWriteSequence();
            }
        } finally {
            writer.dispose();
        }
    }

    private void writeStackedImage(
            PDDocument document,
            PDFRenderer pdfRenderer,
            String imageType,
            ImageType colorType,
            int DPI,
            OutputStream out)
            throws IOException {
        int pageCount = document.getNumberOfPages();
        int maxWidth = 0;
        long totalHeight = 0;

        HashMap<PdfRenderSettingsKey, PdfImageDimensionValue> pageSizes = new HashMap<>();
        for (int i = 0; i < pageCount; ++i) {
            PDPage page = document.getPage(i);
            PDRectangle cropBox = page.getCropBox();
            int rotation = page.getRotation();
            PdfRenderSettingsKey settings =
                    new PdfRenderSettingsKey(cropBox.getWidth(), cropBox.getHeight(), rotation);
            PdfImageDimensionValue dimension = pageSizes.get(settings);
            if (dimension == null) {
                float scale = DPI / 72f;
                int widthPx = (int) Math.max(Math.floor(cropBox.getWidth() * scale), 1);
                int heightPx = (int) Math.max(Math.floor(cropBox.getHeight() * scale), 1);
                if (rotation == 90 || rotation == 270) {
                    int tmp = widthPx;
                    widthPx = heightPx;
                    heightPx = tmp;
                }
                dimension = new PdfImageDimensionValue(widthPx, heightPx);
                pageSizes.put(settings, dimension);
                if (widthPx > maxWidth) {
                    maxWidth = widthPx;
                }
            }
            totalHeight += dimension.height();
        }

        if ((long) maxWidth * totalHeight > MAX_STACKED_IMAGE_PIXELS) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.singleImageTooLarge",
                    "All {0} pages stacked into one image at {1} DPI would be {2} x {3} pixels,"
                            + " which is larger than a single image can hold. Choose multiple"
                            + " images instead, select fewer pages, or use a lower DPI.",
                    pageCount,
                    DPI,
                    maxWidth,
                    totalHeight);
        }

        int stackedWidth = maxWidth;
        int stackedHeight = (int) totalHeight;
        BufferedImage combined =
                ExceptionUtils.handleOomRendering(
                        DPI,
                        () -> prepareImageForPdfToImage(stackedWidth, stackedHeight, imageType));
        Graphics g = combined.getGraphics();
        try {
            int currentHeight = 0;
            for (int i = 0; i < pageCount; ++i) {
                BufferedImage pageImage = renderPage(document, pdfRenderer, i, DPI, colorType);
                int x = (maxWidth - pageImage.getWidth()) / 2;
                g.drawImage(pageImage, x, currentHeight, null);
                currentHeight += pageImage.getHeight();
            }
        } finally {
            g.dispose();
        }

        ImageIO.write(combined, imageType, out);
    }

    private void writeImageZip(
            PDDocument document,
            PDFRenderer pdfRenderer,
            String imageType,
            ImageType colorType,
            int DPI,
            String filename,
            OutputStream out)
            throws IOException {
        String extension = imageType.toLowerCase(Locale.ROOT);
        try (ZipOutputStream zos = new ZipOutputStream(out)) {
            for (int i = 0; i < document.getNumberOfPages(); ++i) {
                BufferedImage image = renderPage(document, pdfRenderer, i, DPI, colorType);
                zos.putNextEntry(new ZipEntry(filename + "_" + (i + 1) + "." + extension));
                ImageIO.write(image, imageType, zos);
                zos.closeEntry();
            }
        }
    }

    private BufferedImage renderPage(
            PDDocument document,
            PDFRenderer pdfRenderer,
            int pageIndex,
            int DPI,
            ImageType colorType)
            throws IOException {
        try {
            ExceptionUtils.validateRenderingDimensions(
                    document.getPage(pageIndex), pageIndex + 1, DPI);
            return ExceptionUtils.handleOomRendering(
                    pageIndex + 1,
                    DPI,
                    () -> pdfRenderer.renderImageWithDPI(pageIndex, DPI, colorType));
        } catch (IllegalArgumentException e) {
            if (e.getMessage() != null
                    && e.getMessage().contains("Maximum size of image exceeded")) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.pageTooBigForDpi",
                        "PDF page {0} is too large to render at {1} DPI. Please try a lower DPI"
                                + " value (recommended: 150 or less).",
                        pageIndex + 1,
                        DPI);
            }
            throw e;
        }
    }

    /**
     * Converts a given Pdf file to PDF-Image.
     *
     * @param document to be converted. Note: the caller is responsible for closing the document
     * @return converted document to PDF-Image
     * @throws IOException if conversion fails
     */
    public PDDocument convertPdfToPdfImage(PDDocument document) throws IOException {
        PDDocument imageDocument = new PDDocument();
        try {
            PDFRenderer pdfRenderer = new PDFRenderer(document);
            pdfRenderer.setSubsamplingAllowed(true);
            for (int page = 0; page < document.getNumberOfPages(); ++page) {
                final int pageIndex = page;
                BufferedImage bim;

                // maxDPI is a safety ceiling for user-supplied values, not a target resolution
                int renderDpi = PDF_TO_IMAGE_DPI;
                ApplicationProperties properties =
                        ApplicationContextProvider.getBean(ApplicationProperties.class);
                if (properties != null && properties.getSystem() != null) {
                    renderDpi = Math.min(renderDpi, properties.getSystem().getMaxDPI());
                }
                final int dpi = renderDpi;

                try {
                    bim =
                            ExceptionUtils.handleOomRendering(
                                    pageIndex + 1,
                                    dpi,
                                    () ->
                                            pdfRenderer.renderImageWithDPI(
                                                    pageIndex, dpi, ImageType.RGB));
                } catch (IllegalArgumentException e) {
                    if (e.getMessage() != null
                            && e.getMessage().contains("Maximum size of image exceeded")) {
                        throw ExceptionUtils.createIllegalArgumentException(
                                "error.pageTooBigFor300Dpi",
                                "PDF page {0} is too large to render at 300 DPI. The resulting image"
                                        + " would exceed Java's maximum array size. Please use a lower DPI"
                                        + " value for PDF-to-image conversion.",
                                pageIndex + 1);
                    }
                    throw e;
                }
                PDPage originalPage = document.getPage(page);

                float width = originalPage.getMediaBox().getWidth();
                float height = originalPage.getMediaBox().getHeight();

                PDPage newPage = new PDPage(new PDRectangle(width, height));
                imageDocument.addPage(newPage);
                PDImageXObject pdImage = LosslessFactory.createFromImage(imageDocument, bim);
                try (PDPageContentStream contentStream =
                        new PDPageContentStream(
                                imageDocument, newPage, AppendMode.APPEND, true, true)) {
                    contentStream.drawImage(pdImage, 0, 0, width, height);
                }
                bim.flush();
            }
            return imageDocument;
        } catch (Exception e) {
            throw e;
        }
    }

    private BufferedImage prepareImageForPdfToImage(int maxWidth, int height, String imageType) {
        BufferedImage combined;
        if ("png".equalsIgnoreCase(imageType)) {
            combined = new BufferedImage(maxWidth, height, BufferedImage.TYPE_INT_ARGB);
        } else {
            combined = new BufferedImage(maxWidth, height, BufferedImage.TYPE_INT_RGB);
        }
        if (!"png".equalsIgnoreCase(imageType)) {
            Graphics g = combined.getGraphics();
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, combined.getWidth(), combined.getHeight());
            g.dispose();
        }
        return combined;
    }

    public byte[] imageToPdf(
            MultipartFile[] files,
            String fitOption,
            boolean autoRotate,
            String colorType,
            CustomPDFDocumentFactory pdfDocumentFactory)
            throws IOException {
        try (PDDocument doc = pdfDocumentFactory.createNewDocument()) {
            for (MultipartFile file : files) {
                if (isTiff(file)) {
                    appendTiffFrames(doc, file, fitOption, autoRotate, colorType);
                } else {
                    appendSingleImage(doc, file, fitOption, autoRotate, colorType);
                }
            }
            ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
            doc.save(byteArrayOutputStream);
            log.debug("PDF successfully saved to byte array");
            return byteArrayOutputStream.toByteArray();
        }
    }

    /**
     * A TIFF is recognised by declared content type as well as filename suffix: an extensionless
     * upload would otherwise take the single-image path and silently drop every frame but one.
     */
    private boolean isTiff(MultipartFile file) {
        if (hasTiffContentType(file.getContentType())) {
            return true;
        }
        String filename = Filenames.toSimpleFileName(file.getOriginalFilename());
        return filename != null
                && (filename.toLowerCase(Locale.ROOT).endsWith(".tiff")
                        || filename.toLowerCase(Locale.ROOT).endsWith(".tif"));
    }

    /** Parsed, not compared whole: RFC 3302 allows parameters such as {@code application=}. */
    private boolean hasTiffContentType(String contentType) {
        if (contentType == null) {
            return false;
        }
        try {
            MediaType mediaType = MediaType.parseMediaType(contentType);
            return "image".equals(mediaType.getType())
                    && ("tiff".equals(mediaType.getSubtype())
                            || "x-tiff".equals(mediaType.getSubtype()));
        } catch (InvalidMediaTypeException e) {
            return false;
        }
    }

    /** Every frame becomes a page; streams and reader are released even when a frame fails. */
    private void appendTiffFrames(
            PDDocument doc,
            MultipartFile file,
            String fitOption,
            boolean autoRotate,
            String colorType)
            throws IOException {
        try (InputStream input = file.getInputStream();
                ImageInputStream imageInput = ImageIO.createImageInputStream(input)) {
            ImageReader reader = ImageIO.getImageReadersByFormatName("tiff").next();
            try {
                reader.setInput(imageInput);
                int numPages = reader.getNumImages(true);
                for (int i = 0; i < numPages; i++) {
                    BufferedImage convertedImage =
                            ImageProcessingUtils.convertColorType(reader.read(i), colorType);
                    PDImageXObject pdImage = LosslessFactory.createFromImage(doc, convertedImage);
                    addImageToDocument(doc, pdImage, fitOption, autoRotate);
                }
            } finally {
                reader.dispose();
            }
        }
    }

    private void appendSingleImage(
            PDDocument doc,
            MultipartFile file,
            String fitOption,
            boolean autoRotate,
            String colorType)
            throws IOException {
        BufferedImage image = ImageProcessingUtils.loadImageWithExifOrientation(file);
        BufferedImage convertedImage = ImageProcessingUtils.convertColorType(image, colorType);
        // Use JPEGFactory if it's JPEG since JPEG is lossy
        String contentType = file.getContentType();
        PDImageXObject pdImage =
                (contentType != null && MediaType.IMAGE_JPEG_VALUE.equals(contentType))
                        ? JPEGFactory.createFromImage(doc, convertedImage)
                        : LosslessFactory.createFromImage(doc, convertedImage);
        addImageToDocument(doc, pdImage, fitOption, autoRotate);
    }

    public void addImageToDocument(
            PDDocument doc, PDImageXObject image, String fitOption, boolean autoRotate)
            throws IOException {
        boolean imageIsLandscape = image.getWidth() > image.getHeight();
        PDRectangle pageSize = PDRectangle.A4;

        if (autoRotate && imageIsLandscape) {
            pageSize = new PDRectangle(pageSize.getHeight(), pageSize.getWidth());
        }

        if ("fitDocumentToImage".equals(fitOption) || "fitDocumentToPage".equals(fitOption)) {
            pageSize = new PDRectangle(image.getWidth(), image.getHeight());
        }

        PDPage page = new PDPage(pageSize);
        doc.addPage(page);

        float pageWidth = page.getMediaBox().getWidth();
        float pageHeight = page.getMediaBox().getHeight();

        try (PDPageContentStream contentStream =
                new PDPageContentStream(doc, page, AppendMode.APPEND, true, true)) {
            if ("fillPage".equals(fitOption)
                    || "fitDocumentToImage".equals(fitOption)
                    || "fitDocumentToPage".equals(fitOption)) {
                contentStream.drawImage(image, 0, 0, pageWidth, pageHeight);
            } else if ("maintainAspectRatio".equals(fitOption)) {
                float imageAspectRatio = (float) image.getWidth() / (float) image.getHeight();
                float pageAspectRatio = pageWidth / pageHeight;

                float scaleFactor = 1.0f;
                if (imageAspectRatio > pageAspectRatio) {
                    scaleFactor = pageWidth / image.getWidth();
                } else {
                    scaleFactor = pageHeight / image.getHeight();
                }

                float xPos = (pageWidth - (image.getWidth() * scaleFactor)) / 2;
                float yPos = (pageHeight - (image.getHeight() * scaleFactor)) / 2;
                contentStream.drawImage(
                        image,
                        xPos,
                        yPos,
                        image.getWidth() * scaleFactor,
                        image.getHeight() * scaleFactor);
            }
        } catch (IOException e) {
            log.error("Error adding image to PDF", e);
            throw e;
        }
    }

    public byte[] overlayImage(
            CustomPDFDocumentFactory pdfDocumentFactory,
            byte[] pdfBytes,
            byte[] imageBytes,
            float x,
            float y,
            boolean everyPage)
            throws IOException {

        try (PDDocument document = pdfDocumentFactory.load(pdfBytes)) {
            // Get the first page of the PDF
            int pages = document.getNumberOfPages();
            for (int i = 0; i < pages; i++) {
                PDPage page = document.getPage(i);
                try (PDPageContentStream contentStream =
                        new PDPageContentStream(
                                document,
                                page,
                                PDPageContentStream.AppendMode.APPEND,
                                true,
                                true)) {
                    // Create an image object from the image bytes
                    PDImageXObject image =
                            PDImageXObject.createFromByteArray(document, imageBytes, "");
                    // Draw the image onto the page at the specified x and y coordinates
                    contentStream.drawImage(image, x, y);
                    log.info("Image successfully overlaid onto PDF");
                    if (!everyPage && i == 0) {
                        break;
                    }
                } catch (IOException e) {
                    // Log an error message if there is an issue overlaying the image onto the PDF
                    log.error("Error overlaying image onto PDF", e);
                    throw e;
                }
            }
            // Create a ByteArrayOutputStream to save the PDF to
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            log.info("PDF successfully saved to byte array");
            return baos.toByteArray();
        }
    }

    public boolean containsTextInFile(PDDocument pdfDocument, String text, String pagesToCheck)
            throws IOException {
        PDFTextStripper textStripper = new PDFTextStripper();
        StringBuilder pdfText = new StringBuilder();

        if (pagesToCheck == null || "all".equals(pagesToCheck)) {
            pdfText = new StringBuilder(textStripper.getText(pdfDocument));
        } else {
            // remove whitespaces using cached pattern
            Pattern whitespacePattern =
                    patternCache.getPattern(RegexPatternUtils.getWhitespaceRegex());
            Matcher whitespaceMatcher = whitespacePattern.matcher(pagesToCheck);
            pagesToCheck = whitespaceMatcher.replaceAll("");

            String[] splitPoints = pagesToCheck.split(",");
            for (String splitPoint : splitPoints) {
                if (splitPoint.contains("-")) {
                    // Handle page ranges
                    String[] range = splitPoint.split("-");
                    int startPage = Integer.parseInt(range[0]);
                    int endPage = Integer.parseInt(range[1]);

                    for (int i = startPage; i <= endPage; i++) {
                        textStripper.setStartPage(i);
                        textStripper.setEndPage(i);
                        pdfText.append(textStripper.getText(pdfDocument));
                    }
                } else {
                    // Handle individual page
                    int page = Integer.parseInt(splitPoint);
                    textStripper.setStartPage(page);
                    textStripper.setEndPage(page);
                    pdfText.append(textStripper.getText(pdfDocument));
                }
            }
        }

        pdfDocument.close();

        return pdfText.toString().contains(text);
    }

    public boolean pageCount(PDDocument pdfDocument, int pageCount, String comparator)
            throws IOException {
        int actualPageCount = pdfDocument.getNumberOfPages();
        pdfDocument.close();

        return switch (comparator.toLowerCase(Locale.ROOT)) {
            case "greater" -> actualPageCount > pageCount;
            case "equal" -> actualPageCount == pageCount;
            case "less" -> actualPageCount < pageCount;
            default ->
                    throw ExceptionUtils.createInvalidArgumentException("comparator", comparator);
        };
    }

    public boolean pageSize(PDDocument pdfDocument, String expectedPageSize) throws IOException {
        PDPage firstPage = pdfDocument.getPage(0);
        PDRectangle mediaBox = firstPage.getMediaBox();

        float actualPageWidth = mediaBox.getWidth();
        float actualPageHeight = mediaBox.getHeight();

        pdfDocument.close();

        // Assumes the expectedPageSize is in the format "widthxheight", e.g. "595x842"
        // for A4
        String[] dimensions = expectedPageSize.split("x");
        float expectedPageWidth = Float.parseFloat(dimensions[0]);
        float expectedPageHeight = Float.parseFloat(dimensions[1]);

        // Checks if the actual page size matches the expected page size
        return actualPageWidth == expectedPageWidth && actualPageHeight == expectedPageHeight;
    }

    /** Key for storing the dimensions of a rendered image in a map. */
    private record PdfRenderSettingsKey(float mediaBoxWidth, float mediaBoxHeight, int rotation) {}

    /** Value for storing the dimensions of a rendered image in a map. */
    private record PdfImageDimensionValue(int width, int height) {}
}
