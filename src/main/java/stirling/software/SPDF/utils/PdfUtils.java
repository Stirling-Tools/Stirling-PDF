package stirling.software.SPDF.utils;

import java.awt.Graphics;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.multipart.MultipartFile;

import com.itextpdf.kernel.pdf.PdfPage;
import com.itextpdf.kernel.pdf.canvas.parser.PdfTextExtractor;
import com.itextpdf.kernel.pdf.canvas.parser.listener.SimpleTextExtractionStrategy;

import stirling.software.SPDF.pdf.ImageFinder;

public class PdfUtils {

    private static final Logger logger = LoggerFactory.getLogger(PdfUtils.class);


	public static PDRectangle textToPageSize(String size) {
		switch (size) {
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

    public boolean hasImageInFile(PDDocument pdfDocument, String text, String pagesToCheck) throws IOException {
        PDFTextStripper textStripper = new PDFTextStripper();
        String pdfText = "";

        if(pagesToCheck == null || pagesToCheck.equals("all")) {
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
    
    public static boolean hasImagesOnPage(PDPage page) throws IOException {
        ImageFinder imageFinder = new ImageFinder(page);
        imageFinder.processPage(page);
        return imageFinder.hasImages();
    }
    
    
    public static boolean hasText(PDDocument  document, String phrase) throws IOException {
    	PDFTextStripper pdfStripper = new PDFTextStripper();
        String text = pdfStripper.getText(document);
        return text.contains(phrase);
   }
    
    
    public boolean containsTextInFile(PDDocument pdfDocument, String text, String pagesToCheck) throws IOException {
        PDFTextStripper textStripper = new PDFTextStripper();
        String pdfText = "";

        if(pagesToCheck == null || pagesToCheck.equals("all")) {
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

    
    
    
    
    public boolean pageCount(PDDocument pdfDocument, int pageCount, String comparator) throws IOException {
        int actualPageCount = pdfDocument.getNumberOfPages();
        pdfDocument.close();

        switch(comparator.toLowerCase()) {
            case "greater":
                return actualPageCount > pageCount;
            case "equal":
                return actualPageCount == pageCount;
            case "less":
                return actualPageCount < pageCount;
            default:
                throw new IllegalArgumentException("Invalid comparator. Only 'greater', 'equal', and 'less' are supported.");
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
    
    
    
    
    
    public static byte[] convertFromPdf(byte[] inputStream, String imageType, ImageType colorType, boolean singleImage, int DPI, String filename) throws IOException, Exception {
        try (PDDocument document = PDDocument.load(new ByteArrayInputStream(inputStream))) {
            PDFRenderer pdfRenderer = new PDFRenderer(document);
            int pageCount = document.getNumberOfPages();
            List<BufferedImage> images = new ArrayList<>();

            // Create images of all pages
            for (int i = 0; i < pageCount; i++) {
                images.add(pdfRenderer.renderImageWithDPI(i, DPI, colorType));
            }

            if (singleImage) {
                // Combine all images into a single big image
                BufferedImage combined = new BufferedImage(images.get(0).getWidth(), images.get(0).getHeight() * pageCount, BufferedImage.TYPE_INT_RGB);
                Graphics g = combined.getGraphics();
                for (int i = 0; i < images.size(); i++) {
                    g.drawImage(images.get(i), 0, i * images.get(0).getHeight(), null);
                }
                images = Arrays.asList(combined);
            }

            // Create a ByteArrayOutputStream to save the image(s) to
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            if (singleImage) {
                // Write the image to the output stream
                ImageIO.write(images.get(0), imageType, baos);

                // Log that the image was successfully written to the byte array
                logger.info("Image successfully written to byte array");
            } else {
                // Zip the images and return as byte array
                try (ZipOutputStream zos = new ZipOutputStream(baos)) {
                    for (int i = 0; i < images.size(); i++) {
                        BufferedImage image = images.get(i);
                        try (ByteArrayOutputStream baosImage = new ByteArrayOutputStream()) {
                            ImageIO.write(image, imageType, baosImage);

                            // Add the image to the zip file
                            zos.putNextEntry(new ZipEntry(String.format(filename + "_%d.%s", i + 1, imageType.toLowerCase())));
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
    public static byte[] imageToPdf(MultipartFile[] files, boolean stretchToFit, boolean autoRotate, String colorType) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (MultipartFile file : files) {
            	String contentType = file.getContentType();
                String originalFilename = file.getOriginalFilename();
                if (originalFilename != null && (originalFilename.toLowerCase().endsWith(".tiff") || originalFilename.toLowerCase().endsWith(".tif")) ) {
                    ImageReader reader = ImageIO.getImageReadersByFormatName("tiff").next();
                    reader.setInput(ImageIO.createImageInputStream(file.getInputStream()));
                    int numPages = reader.getNumImages(true);
                    for (int i = 0; i < numPages; i++) {
                        BufferedImage pageImage = reader.read(i);
                        BufferedImage convertedImage = ImageProcessingUtils.convertColorType(pageImage, colorType);
                        PDImageXObject pdImage = LosslessFactory.createFromImage(doc, convertedImage);
                        addImageToDocument(doc, pdImage, stretchToFit, autoRotate);
                    }
                } else {
                    File imageFile = Files.createTempFile("image", ".png").toFile();
                    try (FileOutputStream fos = new FileOutputStream(imageFile); InputStream input = file.getInputStream()) {
                        byte[] buffer = new byte[1024];
                        int len;
                        while ((len = input.read(buffer)) != -1) {
                            fos.write(buffer, 0, len);
                        }
                        BufferedImage image = ImageIO.read(imageFile);
                        BufferedImage convertedImage = ImageProcessingUtils.convertColorType(image, colorType);
                        PDImageXObject pdImage;
                        if (contentType != null && (contentType.equals("image/jpeg"))) {
                            pdImage = JPEGFactory.createFromImage(doc, convertedImage);
                        } else {
                            pdImage = LosslessFactory.createFromImage(doc, convertedImage);
                        }
                        addImageToDocument(doc, pdImage, stretchToFit, autoRotate);
                    } catch (IOException e) {
                        logger.error("Error writing image to file: {}", imageFile.getAbsolutePath(), e);
                        throw e;
                    } finally {
                        imageFile.delete();
                    }
                }
            }
            ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
            doc.save(byteArrayOutputStream);
            logger.info("PDF successfully saved to byte array");
            return byteArrayOutputStream.toByteArray();
        }
    }

    private static void addImageToDocument(PDDocument doc, PDImageXObject image, boolean stretchToFit, boolean autoRotate) throws IOException {
        boolean imageIsLandscape = image.getWidth() > image.getHeight();
        PDRectangle pageSize = PDRectangle.A4;
        if (autoRotate && imageIsLandscape) {
            pageSize = new PDRectangle(pageSize.getHeight(), pageSize.getWidth());
        }
        PDPage page = new PDPage(pageSize);
        doc.addPage(page);

        float pageWidth = page.getMediaBox().getWidth();
        float pageHeight = page.getMediaBox().getHeight();

        try (PDPageContentStream contentStream = new PDPageContentStream(doc, page)) {
            if (stretchToFit) {
                contentStream.drawImage(image, 0, 0, pageWidth, pageHeight);
            } else {
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
                contentStream.drawImage(image, xPos, yPos, image.getWidth() * scaleFactor, image.getHeight() * scaleFactor);
            }
        } catch (IOException e) {
            logger.error("Error adding image to PDF", e);
            throw e;
        }
    }

    public static byte[] overlayImage(byte[] pdfBytes, byte[] imageBytes, float x, float y, boolean everyPage) throws IOException {

        PDDocument document = PDDocument.load(new ByteArrayInputStream(pdfBytes));

        // Get the first page of the PDF
        int pages = document.getNumberOfPages();
        for (int i = 0; i < pages; i++) {
            PDPage page = document.getPage(i);
            try (PDPageContentStream contentStream = new PDPageContentStream(document, page, PDPageContentStream.AppendMode.APPEND, true)) {
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

   

    
}
