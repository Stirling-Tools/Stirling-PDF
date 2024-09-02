package stirling.software.SPDF.utils;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.awt.image.RenderedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.*;
import javax.imageio.stream.ImageOutputStream;

import org.apache.pdfbox.Loader;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;

import stirling.software.SPDF.model.PdfMetadata;

public class PdfUtils {

    private static final Logger logger = LoggerFactory.getLogger(PdfUtils.class);

    public static PDRectangle textToPageSize(String size) {
        switch (size.toUpperCase()) {
            case "A0":
                return PDRectangle.A0;
            case "A1":
                return PDRectangle.A1;
            case "A2":
                return PDRectangle.A2;
            case "A3":
                return PDRectangle.A3;
            case "A4":
                return PDRectangle.A4;
            case "A5":
                return PDRectangle.A5;
            case "A6":
                return PDRectangle.A6;
            case "LETTER":
                return PDRectangle.LETTER;
            case "LEGAL":
                return PDRectangle.LEGAL;
            default:
                throw new IllegalArgumentException("Invalid standard page size: " + size);
        }
    }

    public static List<RenderedImage> getAllImages(PDResources resources) throws IOException {
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

    public static boolean hasImages(PDDocument document, String pagesToCheck) throws IOException {
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

    public static boolean hasText(PDDocument document, String pageNumbersToCheck, String phrase)
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

    public static boolean hasImagesOnPage(PDPage page) throws IOException {
        return getAllImages(page.getResources()).size() > 0;
    }

    public static boolean hasTextOnPage(PDPage page, String phrase) throws IOException {
        PDFTextStripper textStripper = new PDFTextStripper();
        PDDocument tempDoc = new PDDocument();
        tempDoc.addPage(page);
        String pageText = textStripper.getText(tempDoc);
        tempDoc.close();
        return pageText.contains(phrase);
    }

    public boolean containsTextInFile(PDDocument pdfDocument, String text, String pagesToCheck)
            throws IOException {
        PDFTextStripper textStripper = new PDFTextStripper();
        String pdfText = "";

        if (pagesToCheck == null || "all".equals(pagesToCheck)) {
            pdfText = textStripper.getText(pdfDocument);
        } else {
            // remove whitespaces
            pagesToCheck = pagesToCheck.replaceAll("\\s+", "");

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
                        pdfText += textStripper.getText(pdfDocument);
                    }
                } else {
                    // Handle individual page
                    int page = Integer.parseInt(splitPoint);
                    textStripper.setStartPage(page);
                    textStripper.setEndPage(page);
                    pdfText += textStripper.getText(pdfDocument);
                }
            }
        }

        pdfDocument.close();

        return pdfText.contains(text);
    }

    public boolean pageCount(PDDocument pdfDocument, int pageCount, String comparator)
            throws IOException {
        int actualPageCount = pdfDocument.getNumberOfPages();
        pdfDocument.close();

        switch (comparator.toLowerCase()) {
            case "greater":
                return actualPageCount > pageCount;
            case "equal":
                return actualPageCount == pageCount;
            case "less":
                return actualPageCount < pageCount;
            default:
                throw new IllegalArgumentException(
                        "Invalid comparator. Only 'greater', 'equal', and 'less' are supported.");
        }
    }

    public boolean pageSize(PDDocument pdfDocument, String expectedPageSize) throws IOException {
        PDPage firstPage = pdfDocument.getPage(0);
        PDRectangle mediaBox = firstPage.getMediaBox();

        float actualPageWidth = mediaBox.getWidth();
        float actualPageHeight = mediaBox.getHeight();

        pdfDocument.close();

        // Assumes the expectedPageSize is in the format "widthxheight", e.g. "595x842" for A4
        String[] dimensions = expectedPageSize.split("x");
        float expectedPageWidth = Float.parseFloat(dimensions[0]);
        float expectedPageHeight = Float.parseFloat(dimensions[1]);

        // Checks if the actual page size matches the expected page size
        return actualPageWidth == expectedPageWidth && actualPageHeight == expectedPageHeight;
    }

    public static byte[] convertFromPdf(
            byte[] inputStream,
            String imageType,
            ImageType colorType,
            boolean singleImage,
            int DPI,
            String filename)
            throws IOException, Exception {
        try (PDDocument document = Loader.loadPDF(inputStream)) {
            PDFRenderer pdfRenderer = new PDFRenderer(document);
            pdfRenderer.setSubsamplingAllowed(true);
            int pageCount = document.getNumberOfPages();

            // Create a ByteArrayOutputStream to save the image(s) to
            ByteArrayOutputStream baos = new ByteArrayOutputStream();

            if (singleImage) {
                if ("tiff".equals(imageType.toLowerCase())
                        || "tif".equals(imageType.toLowerCase())) {
                    // Write the images to the output stream as a TIFF with multiple frames
                    ImageWriter writer = ImageIO.getImageWritersByFormatName("tiff").next();
                    ImageWriteParam param = writer.getDefaultWriteParam();
                    param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                    param.setCompressionType("ZLib");
                    param.setCompressionQuality(1.0f);

                    try (ImageOutputStream ios = ImageIO.createImageOutputStream(baos)) {
                        writer.setOutput(ios);
                        writer.prepareWriteSequence(null);

                        for (int i = 0; i < pageCount; ++i) {
                            BufferedImage image = pdfRenderer.renderImageWithDPI(i, DPI, colorType);
                            writer.writeToSequence(new IIOImage(image, null, null), param);
                        }

                        writer.endWriteSequence();
                    }

                    writer.dispose();
                } else {
                    // Combine all images into a single big image

                    // Calculate the combined image dimensions
                    int maxWidth = 0;
                    int totalHeight = 0;

                    BufferedImage pdfSizeImage = null;
                    int pdfSizeImageIndex = -1;

                    // Using a map to store the rendered dimensions of each page size
                    // to avoid rendering the same page sizes multiple times
                    HashMap<PdfRenderSettingsKey, PdfImageDimensionValue> pageSizes =
                            new HashMap<>();
                    for (int i = 0; i < pageCount; ++i) {
                        PDPage page = document.getPage(i);
                        PDRectangle mediaBox = page.getMediaBox();
                        int rotation = page.getRotation();
                        PdfRenderSettingsKey settings =
                                new PdfRenderSettingsKey(
                                        mediaBox.getWidth(), mediaBox.getHeight(), rotation);
                        PdfImageDimensionValue dimension = pageSizes.get(settings);
                        if (dimension == null) {
                            // Render the image to get the dimensions
                            pdfSizeImage = pdfRenderer.renderImageWithDPI(i, DPI, colorType);
                            pdfSizeImageIndex = i;
                            dimension =
                                    new PdfImageDimensionValue(
                                            pdfSizeImage.getWidth(), pdfSizeImage.getHeight());
                            pageSizes.put(settings, dimension);
                            if (pdfSizeImage.getWidth() > maxWidth) {
                                maxWidth = pdfSizeImage.getWidth();
                            }
                        }
                        totalHeight += dimension.height();
                    }

                    // Create a new BufferedImage to store the combined images
                    BufferedImage combined =
                            prepareImageForPdfToImage(maxWidth, totalHeight, imageType);
                    Graphics g = combined.getGraphics();

                    int currentHeight = 0;
                    BufferedImage pageImage;

                    // Check if the first image is the last rendered image
                    boolean firstImageAlreadyRendered = pdfSizeImageIndex == 0;

                    for (int i = 0; i < pageCount; ++i) {
                        if (firstImageAlreadyRendered && i == 0) {
                            pageImage = pdfSizeImage;
                        } else {
                            pageImage = pdfRenderer.renderImageWithDPI(i, DPI, colorType);
                        }

                        // Calculate the x-coordinate to center the image
                        int x = (maxWidth - pageImage.getWidth()) / 2;

                        g.drawImage(pageImage, x, currentHeight, null);
                        currentHeight += pageImage.getHeight();
                    }

                    // Write the image to the output stream
                    ImageIO.write(combined, imageType, baos);
                }

                // Log that the image was successfully written to the byte array
                logger.info("Image successfully written to byte array");
            } else {
                // Zip the images and return as byte array
                try (ZipOutputStream zos = new ZipOutputStream(baos)) {
                    for (int i = 0; i < pageCount; ++i) {
                        BufferedImage image = pdfRenderer.renderImageWithDPI(i, DPI, colorType);
                        try (ByteArrayOutputStream baosImage = new ByteArrayOutputStream()) {
                            ImageIO.write(image, imageType, baosImage);

                            // Add the image to the zip file
                            zos.putNextEntry(
                                    new ZipEntry(
                                            String.format(
                                                    filename + "_%d.%s",
                                                    i + 1,
                                                    imageType.toLowerCase())));
                            zos.write(baosImage.toByteArray());
                        }
                    }
                    // Log that the images were successfully written to the byte array
                    logger.info("Images successfully written to byte array as a zip");
                }
            }
            return baos.toByteArray();
        } catch (IOException e) {
            // Log an error message if there is an issue converting the PDF to an image
            logger.error("Error converting PDF to image", e);
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
    public static PDDocument convertPdfToPdfImage(PDDocument document) throws IOException {
        PDDocument imageDocument = new PDDocument();
        PDFRenderer pdfRenderer = new PDFRenderer(document);
        pdfRenderer.setSubsamplingAllowed(true);
        for (int page = 0; page < document.getNumberOfPages(); ++page) {
            BufferedImage bim = pdfRenderer.renderImageWithDPI(page, 300, ImageType.RGB);
            PDPage newPage = new PDPage(new PDRectangle(bim.getWidth(), bim.getHeight()));
            imageDocument.addPage(newPage);
            PDImageXObject pdImage = LosslessFactory.createFromImage(imageDocument, bim);
            PDPageContentStream contentStream =
                    new PDPageContentStream(imageDocument, newPage, AppendMode.APPEND, true, true);
            contentStream.drawImage(pdImage, 0, 0);
            contentStream.close();
        }
        return imageDocument;
    }

    private static BufferedImage prepareImageForPdfToImage(
            int maxWidth, int height, String imageType) {
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

    public static byte[] imageToPdf(
            MultipartFile[] files, String fitOption, boolean autoRotate, String colorType)
            throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (MultipartFile file : files) {
                String contentType = file.getContentType();
                String originalFilename = Filenames.toSimpleFileName(file.getOriginalFilename());
                if (originalFilename != null
                        && (originalFilename.toLowerCase().endsWith(".tiff")
                                || originalFilename.toLowerCase().endsWith(".tif"))) {
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
                    BufferedImage image = ImageIO.read(file.getInputStream());
                    BufferedImage convertedImage =
                            ImageProcessingUtils.convertColorType(image, colorType);
                    // Use JPEGFactory if it's JPEG since JPEG is lossy
                    PDImageXObject pdImage =
                            (contentType != null && "image/jpeg".equals(contentType))
                                    ? JPEGFactory.createFromImage(doc, convertedImage)
                                    : LosslessFactory.createFromImage(doc, convertedImage);
                    addImageToDocument(doc, pdImage, fitOption, autoRotate);
                }
            }
            ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
            doc.save(byteArrayOutputStream);
            logger.info("PDF successfully saved to byte array");
            return byteArrayOutputStream.toByteArray();
        }
    }

    public static void addImageToDocument(
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
            logger.error("Error adding image to PDF", e);
            throw e;
        }
    }

    public static byte[] overlayImage(
            byte[] pdfBytes, byte[] imageBytes, float x, float y, boolean everyPage)
            throws IOException {

        PDDocument document = Loader.loadPDF(pdfBytes);

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
                logger.info("Image successfully overlayed onto PDF");
                if (!everyPage && i == 0) {
                    break;
                }
            } catch (IOException e) {
                // Log an error message if there is an issue overlaying the image onto the PDF
                logger.error("Error overlaying image onto PDF", e);
                throw e;
            }
        }
        // Create a ByteArrayOutputStream to save the PDF to
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        logger.info("PDF successfully saved to byte array");
        return baos.toByteArray();
    }

    public static PdfMetadata extractMetadataFromPdf(PDDocument pdf) {
        return PdfMetadata.builder()
                .author(pdf.getDocumentInformation().getAuthor())
                .producer(pdf.getDocumentInformation().getProducer())
                .title(pdf.getDocumentInformation().getTitle())
                .creator(pdf.getDocumentInformation().getCreator())
                .subject(pdf.getDocumentInformation().getSubject())
                .keywords(pdf.getDocumentInformation().getKeywords())
                .creationDate(pdf.getDocumentInformation().getCreationDate())
                .modificationDate(pdf.getDocumentInformation().getModificationDate())
                .build();
    }

    public static void setMetadataToPdf(PDDocument pdf, PdfMetadata pdfMetadata) {
        pdf.getDocumentInformation().setAuthor(pdfMetadata.getAuthor());
        pdf.getDocumentInformation().setProducer(pdfMetadata.getProducer());
        pdf.getDocumentInformation().setTitle(pdfMetadata.getTitle());
        pdf.getDocumentInformation().setCreator(pdfMetadata.getCreator());
        pdf.getDocumentInformation().setSubject(pdfMetadata.getSubject());
        pdf.getDocumentInformation().setKeywords(pdfMetadata.getKeywords());
        pdf.getDocumentInformation().setCreationDate(pdfMetadata.getCreationDate());
        pdf.getDocumentInformation().setModificationDate(Calendar.getInstance());
    }

    /** Key for storing the dimensions of a rendered image in a map. */
    private record PdfRenderSettingsKey(float mediaBoxWidth, float mediaBoxHeight, int rotation) {}

    /** Value for storing the dimensions of a rendered image in a map. */
    private record PdfImageDimensionValue(int width, int height) {}
}
