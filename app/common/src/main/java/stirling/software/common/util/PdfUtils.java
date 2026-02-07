package stirling.software.common.util;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.awt.image.RenderedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.*;
import javax.imageio.stream.ImageOutputStream;

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

    public List<RenderedImage> getAllImages(PDResources resources) throws IOException {
        List<RenderedImage> images = new ArrayList<>();

        for (COSName name : resources.getXObjectNames()) {
            PDXObject object = resources.getXObject(name);

            if (object instanceof PDImageXObject) {
                images.add(((PDImageXObject) object).getImage());

            } else if (object instanceof PDFormXObject) {
                images.addAll(getAllImages(((PDFormXObject) object).getResources()));
            }
        }

        return images;
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
        return !getAllImages(page.getResources()).isEmpty();
    }

    public boolean hasTextOnPage(PDPage page, String phrase) throws IOException {
        PDFTextStripper textStripper = new PDFTextStripper();
        try (PDDocument tempDoc = new PDDocument()) {
            tempDoc.addPage(page);
            String pageText = textStripper.getText(tempDoc);
            return pageText.contains(phrase);
        }
    }

    public byte[] convertFromPdf(
            CustomPDFDocumentFactory pdfDocumentFactory,
            byte[] inputStream,
            String imageType,
            ImageType colorType,
            boolean singleImage,
            int DPI,
            String filename,
            boolean includeAnnotations)
            throws IOException, Exception {

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

        try (PDDocument document = pdfDocumentFactory.load(inputStream);
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            PDFRenderer pdfRenderer = new PDFRenderer(document);
            pdfRenderer.setSubsamplingAllowed(true);
            if (!includeAnnotations) {
                pdfRenderer.setAnnotationsFilter(annotation -> false);
            }
            int pageCount = document.getNumberOfPages();

            int configuredParallelism =
                    Math.min(64, Math.max(2, Runtime.getRuntime().availableProcessors() * 2));
            int desiredParallelism = Math.max(1, Math.min(pageCount, configuredParallelism));

            if (singleImage) {
                if ("tiff".equals(imageType.toLowerCase(Locale.ROOT))
                        || "tif".equals(imageType.toLowerCase(Locale.ROOT))) {
                    try (ManagedForkJoinPool managedPool =
                                    new ManagedForkJoinPool(desiredParallelism);
                            PdfThreadLocalResources renderingResources =
                                    new PdfThreadLocalResources(pdfDocumentFactory, inputStream)) {
                        ForkJoinPool customPool = managedPool.getPool();

                        // Write the images to the output stream as a TIFF with multiple frames
                        ImageWriter writer = ImageIO.getImageWritersByFormatName("tiff").next();
                        ImageWriteParam param = writer.getDefaultWriteParam();
                        param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                        param.setCompressionType("ZLib");
                        param.setCompressionQuality(1.0f);

                        try (ImageOutputStream ios = ImageIO.createImageOutputStream(baos)) {
                            writer.setOutput(ios);
                            writer.prepareWriteSequence(null);

                            // Process in batches to save memory
                            int batchSize = 10;
                            for (int i = 0; i < pageCount; i += batchSize) {
                                int start = i;
                                int end = Math.min(pageCount, i + batchSize);

                                List<BufferedImage> batchImages =
                                        customPool
                                                .submit(
                                                        () ->
                                                                IntStream.range(start, end)
                                                                        .parallel()
                                                                        .mapToObj(
                                                                                pageNum -> {
                                                                                    try {
                                                                                        // Validate
                                                                                        // dimensions before
                                                                                        // rendering
                                                                                        ExceptionUtils
                                                                                                .validateRenderingDimensions(
                                                                                                        renderingResources
                                                                                                                .getDocument()
                                                                                                                .getPage(
                                                                                                                        pageNum),
                                                                                                        pageNum
                                                                                                                + 1,
                                                                                                        DPI);

                                                                                        return ExceptionUtils
                                                                                                .handleOomRendering(
                                                                                                        pageNum
                                                                                                                + 1,
                                                                                                        DPI,
                                                                                                        () ->
                                                                                                                renderingResources
                                                                                                                        .renderPage(
                                                                                                                                pageNum,
                                                                                                                                DPI,
                                                                                                                                colorType));
                                                                                    } catch (
                                                                                            Exception
                                                                                                    e) {
                                                                                        throw new RuntimeException(
                                                                                                e);
                                                                                    }
                                                                                })
                                                                        .collect(
                                                                                Collectors
                                                                                        .toList()))
                                                .get();

                                for (BufferedImage image : batchImages) {
                                    writer.writeToSequence(new IIOImage(image, null, null), param);
                                    image.flush();
                                }
                            }

                            writer.endWriteSequence();
                        }
                        writer.dispose();
                    } catch (ExecutionException | InterruptedException e) {
                        if (e.getCause() instanceof IllegalArgumentException) {
                            throw (IllegalArgumentException) e.getCause();
                        }
                        throw new IOException("Error during parallel TIFF rendering", e);
                    }
                } else {
                    // Combine all images into a single big image

                    // Calculate the combined image dimensions
                    int maxWidth = 0;
                    int totalHeight = 0;

                    try (ManagedForkJoinPool managedPool =
                                    new ManagedForkJoinPool(desiredParallelism);
                            PdfThreadLocalResources renderingResources =
                                    new PdfThreadLocalResources(pdfDocumentFactory, inputStream)) {
                        ForkJoinPool customPool = managedPool.getPool();

                        List<PdfImageDimensionValue> dimensions;
                        dimensions =
                                customPool
                                        .submit(
                                                () ->
                                                        IntStream.range(0, pageCount)
                                                                .parallel()
                                                                .mapToObj(
                                                                        i -> {
                                                                            try {
                                                                                PDPage page =
                                                                                        renderingResources
                                                                                                .getDocument()
                                                                                                .getPage(
                                                                                                        i);
                                                                                // Validate
                                                                                // dimensions before
                                                                                // rendering
                                                                                ExceptionUtils
                                                                                        .validateRenderingDimensions(
                                                                                                page,
                                                                                                i
                                                                                                        + 1,
                                                                                                DPI);

                                                                                PDRectangle
                                                                                        mediaBox =
                                                                                                page
                                                                                                        .getMediaBox();
                                                                                int rotation =
                                                                                        page
                                                                                                .getRotation();
                                                                                float widthPts =
                                                                                        (rotation
                                                                                                                % 180
                                                                                                        == 0)
                                                                                                ? mediaBox
                                                                                                        .getWidth()
                                                                                                : mediaBox
                                                                                                        .getHeight();
                                                                                float heightPts =
                                                                                        (rotation
                                                                                                                % 180
                                                                                                        == 0)
                                                                                                ? mediaBox
                                                                                                        .getHeight()
                                                                                                : mediaBox
                                                                                                        .getWidth();
                                                                                return new PdfImageDimensionValue(
                                                                                        Math.round(
                                                                                                widthPts
                                                                                                        * DPI
                                                                                                        / 72f),
                                                                                        Math.round(
                                                                                                heightPts
                                                                                                        * DPI
                                                                                                        / 72f));
                                                                            } catch (Exception e) {
                                                                                throw new RuntimeException(
                                                                                        e);
                                                                            }
                                                                        })
                                                                .toList())
                                        .get();

                        for (PdfImageDimensionValue dim : dimensions) {
                            if (dim.width() > maxWidth) {
                                maxWidth = dim.width();
                            }
                            totalHeight += dim.height();
                        }

                        // Create a new BufferedImage to store the combined images
                        BufferedImage combined =
                                prepareImageForPdfToImage(maxWidth, totalHeight, imageType);
                        Graphics g = combined.getGraphics();

                        // Process in batches to save memory
                        int batchSize = 10;
                        int currentHeightTotal = 0;
                        for (int i = 0; i < pageCount; i += batchSize) {
                            int start = i;
                            int end = Math.min(pageCount, i + batchSize);

                            List<BufferedImage> pageImages =
                                    customPool
                                            .submit(
                                                    () ->
                                                            IntStream.range(start, end)
                                                                    .parallel()
                                                                    .mapToObj(
                                                                            pageNum -> {
                                                                                try {
                                                                                    return ExceptionUtils
                                                                                            .handleOomRendering(
                                                                                                    pageNum
                                                                                                            + 1,
                                                                                                    DPI,
                                                                                                    () ->
                                                                                                            renderingResources
                                                                                                                    .renderPage(
                                                                                                                            pageNum,
                                                                                                                            DPI,
                                                                                                                            colorType));
                                                                                } catch (
                                                                                        Exception
                                                                                                e) {
                                                                                    throw new RuntimeException(
                                                                                            e);
                                                                                }
                                                                            })
                                                                    .toList())
                                            .get();

                            for (BufferedImage pageImage : pageImages) {
                                int x = (maxWidth - pageImage.getWidth()) / 2;
                                g.drawImage(pageImage, x, currentHeightTotal, null);
                                currentHeightTotal += pageImage.getHeight();
                                pageImage.flush();
                            }
                        }

                        // Write the image to the output stream
                        ImageIO.write(combined, imageType, baos);
                    } catch (ExecutionException | InterruptedException e) {
                        throw new IOException("Error processing combined image in parallel", e);
                    }
                }

                // Log that the image was successfully written to the byte array
                log.info("Image successfully written to byte array");
            } else {
                // Zip the images and return as byte array

                try (ManagedForkJoinPool managedPool = new ManagedForkJoinPool(desiredParallelism);
                        PdfThreadLocalResources renderingResources =
                                new PdfThreadLocalResources(pdfDocumentFactory, inputStream);
                        ZipOutputStream zos = new ZipOutputStream(baos)) {
                    ForkJoinPool customPool = managedPool.getPool();

                    // Process in batches to save memory
                    int batchSize = 10;
                    for (int i = 0; i < pageCount; i += batchSize) {
                        int start = i;
                        int end = Math.min(pageCount, i + batchSize);

                        List<byte[]> batchImages =
                                customPool
                                        .submit(
                                                () ->
                                                        IntStream.range(start, end)
                                                                .parallel()
                                                                .mapToObj(
                                                                        pageNum -> {
                                                                            try (ByteArrayOutputStream
                                                                                    imageBaos =
                                                                                            new ByteArrayOutputStream()) {
                                                                                BufferedImage
                                                                                        image =
                                                                                                ExceptionUtils
                                                                                                        .handleOomRendering(
                                                                                                                pageNum
                                                                                                                        + 1,
                                                                                                                DPI,
                                                                                                                () ->
                                                                                                                        renderingResources
                                                                                                                                .renderPage(
                                                                                                                                        pageNum,
                                                                                                                                        DPI,
                                                                                                                                        colorType));
                                                                                ImageIO.write(
                                                                                        image,
                                                                                        imageType,
                                                                                        imageBaos);
                                                                                image.flush();
                                                                                return imageBaos
                                                                                        .toByteArray();
                                                                            } catch (Exception e) {
                                                                                throw new RuntimeException(
                                                                                        e);
                                                                            }
                                                                        })
                                                                .collect(Collectors.toList()))
                                        .get();

                        for (int j = 0; j < batchImages.size(); j++) {
                            int pageNum = start + j;
                            ZipEntry entry =
                                    new ZipEntry(
                                            filename
                                                    + "_"
                                                    + (pageNum + 1)
                                                    + "."
                                                    + imageType.toLowerCase(Locale.ROOT));
                            zos.putNextEntry(entry);
                            zos.write(batchImages.get(j));
                            zos.closeEntry();
                        }
                    }
                    zos.finish();
                } catch (ExecutionException | InterruptedException e) {
                    throw new IOException("Error during parallel ZIP rendering", e);
                }
            }
            return baos.toByteArray();
        } catch (IOException e) {
            // Log an error message if there is an issue converting the PDF to an image
            log.error("Error converting PDF to image", e);
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

                // Use global maximum DPI setting, fallback to 300 if not set
                int renderDpi = 300; // Default fallback
                ApplicationProperties properties =
                        ApplicationContextProvider.getBean(ApplicationProperties.class);
                if (properties != null && properties.getSystem() != null) {
                    renderDpi = properties.getSystem().getMaxDPI();
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
                String contentType = file.getContentType();
                String originalFilename = Filenames.toSimpleFileName(file.getOriginalFilename());
                if (originalFilename != null
                        && (originalFilename.toLowerCase(Locale.ROOT).endsWith(".tiff")
                                || originalFilename.toLowerCase(Locale.ROOT).endsWith(".tif"))) {
                    ImageReader reader = ImageIO.getImageReadersByFormatName("tiff").next();
                    reader.setInput(ImageIO.createImageInputStream(file.getInputStream()));
                    int numPages = reader.getNumImages(true);
                    for (int i = 0; i < numPages; i++) {
                        BufferedImage pageImage = reader.read(i);
                        BufferedImage convertedImage =
                                ImageProcessingUtils.convertColorType(pageImage, colorType);
                        PDImageXObject pdImage =
                                LosslessFactory.createFromImage(doc, convertedImage);
                        addImageToDocument(doc, pdImage, fitOption, autoRotate);
                    }
                } else {
                    BufferedImage image = ImageProcessingUtils.loadImageWithExifOrientation(file);
                    BufferedImage convertedImage =
                            ImageProcessingUtils.convertColorType(image, colorType);
                    // Use JPEGFactory if it's JPEG since JPEG is lossy
                    PDImageXObject pdImage =
                            (contentType != null && MediaType.IMAGE_JPEG_VALUE.equals(contentType))
                                    ? JPEGFactory.createFromImage(doc, convertedImage)
                                    : LosslessFactory.createFromImage(doc, convertedImage);
                    addImageToDocument(doc, pdImage, fitOption, autoRotate);
                }
            }
            ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
            doc.save(byteArrayOutputStream);
            log.debug("PDF successfully saved to byte array");
            return byteArrayOutputStream.toByteArray();
        }
    }

    public void addImageToDocument(
            PDDocument doc, PDImageXObject image, String fitOption, boolean autoRotate)
            throws IOException {
        boolean imageIsLandscape = image.getWidth() > image.getHeight();
        PDRectangle pageSize = PDRectangle.A4;

        if (autoRotate && imageIsLandscape) {
            pageSize = new PDRectangle(pageSize.getHeight(), pageSize.getWidth());
        }

        if ("fitDocumentToImage".equals(fitOption)) {
            pageSize = new PDRectangle(image.getWidth(), image.getHeight());
        }

        PDPage page = new PDPage(pageSize);
        doc.addPage(page);

        float pageWidth = page.getMediaBox().getWidth();
        float pageHeight = page.getMediaBox().getHeight();

        try (PDPageContentStream contentStream =
                new PDPageContentStream(doc, page, AppendMode.APPEND, true, true)) {
            if ("fillPage".equals(fitOption) || "fitDocumentToImage".equals(fitOption)) {
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

        PDDocument document = pdfDocumentFactory.load(pdfBytes);

        // Get the first page of the PDF
        int pages = document.getNumberOfPages();
        for (int i = 0; i < pages; i++) {
            PDPage page = document.getPage(i);
            try (PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
                // Create an image object from the image bytes
                PDImageXObject image = PDImageXObject.createFromByteArray(document, imageBytes, "");
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
