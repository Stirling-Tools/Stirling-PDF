package stirling.software.common.util.misc;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.core.io.InputStreamResource;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ApplicationContextProvider;

public class InvertFullColorStrategy extends ReplaceAndInvertColorStrategy {

    // Size limits to prevent OutOfMemoryError
    private static final int MAX_IMAGE_WIDTH = 8192;
    private static final int MAX_IMAGE_HEIGHT = 8192;
    private static final long MAX_IMAGE_PIXELS = 16_777_216; // 4096x4096

    public InvertFullColorStrategy(MultipartFile file, ReplaceAndInvert replaceAndInvert) {
        super(file, replaceAndInvert);
    }

    @Override
    public InputStreamResource replace() throws IOException {

        File file = null;
        try {
            // Create a temporary file, with the original filename from the multipart file
            file = Files.createTempFile("temp", getFileInput().getOriginalFilename()).toFile();

            // Transfer the content of the multipart file to the file
            getFileInput().transferTo(file);

            // Get CustomPDFDocumentFactory from application context
            CustomPDFDocumentFactory pdfDocumentFactory =
                    ApplicationContextProvider.getBean(CustomPDFDocumentFactory.class);

            // Load the uploaded PDF using the factory for better memory management
            PDDocument document = pdfDocumentFactory.load(file);

            // Render each page and invert colors
            PDFRenderer pdfRenderer = new PDFRenderer(document);
            pdfRenderer.setSubsamplingAllowed(true);

            for (int page = 0; page < document.getNumberOfPages(); page++) {
                PDPage pdPage = document.getPage(page);
                PDRectangle pageSize = pdPage.getMediaBox();

                // Calculate what the image dimensions would be at 300 DPI
                int projectedWidth = (int) Math.ceil(pageSize.getWidth() * 300 / 72.0);
                int projectedHeight = (int) Math.ceil(pageSize.getHeight() * 300 / 72.0);
                long projectedPixels = (long) projectedWidth * projectedHeight;

                // Skip pages that would exceed memory limits
                if (projectedWidth > MAX_IMAGE_WIDTH
                        || projectedHeight > MAX_IMAGE_HEIGHT
                        || projectedPixels > MAX_IMAGE_PIXELS) {

                    System.err.println(
                            "Skipping page "
                                    + (page + 1)
                                    + " - would exceed memory limits ("
                                    + projectedWidth
                                    + "x"
                                    + projectedHeight
                                    + " pixels)");
                    continue;
                }

                BufferedImage image;
                try {
                    image = pdfRenderer.renderImageWithDPI(page, 300); // Render page at 300 DPI
                } catch (IllegalArgumentException e) {
                    if (e.getMessage() != null
                            && e.getMessage().contains("Maximum size of image exceeded")) {
                        System.err.println(
                                "Skipping page "
                                        + (page + 1)
                                        + " - image size exceeds PDFBox limits");
                        continue;
                    }
                    throw e;
                } catch (OutOfMemoryError e) {
                    System.err.println("Skipping page " + (page + 1) + " - out of memory");
                    continue;
                }

                // Invert the colors
                invertImageColors(image);

                // Create a new PDPage from the inverted image
                PDPage currentPage = document.getPage(page);
                File tempImageFile = null;
                try {
                    tempImageFile = convertToBufferedImageTpFile(image);
                    PDImageXObject pdImage =
                            PDImageXObject.createFromFileByContent(tempImageFile, document);

                    PDPageContentStream contentStream =
                            new PDPageContentStream(
                                    document,
                                    currentPage,
                                    PDPageContentStream.AppendMode.OVERWRITE,
                                    true);
                    contentStream.drawImage(
                            pdImage,
                            0,
                            0,
                            currentPage.getMediaBox().getWidth(),
                            currentPage.getMediaBox().getHeight());
                    contentStream.close();
                } finally {
                    if (tempImageFile != null && tempImageFile.exists()) {
                        Files.delete(tempImageFile.toPath());
                    }
                }
            }

            // Save the modified PDF to a ByteArrayOutputStream
            ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
            document.save(byteArrayOutputStream);
            document.close();

            // Prepare the modified PDF for download
            ByteArrayInputStream inputStream =
                    new ByteArrayInputStream(byteArrayOutputStream.toByteArray());
            InputStreamResource resource = new InputStreamResource(inputStream);
            return resource;
        } finally {
            if (file != null && file.exists()) {
                Files.delete(file.toPath());
            }
        }
    }

    // Method to invert image colors
    private void invertImageColors(BufferedImage image) {
        int width = image.getWidth();
        int height = image.getHeight();
        for (int x = 0; x < width; x++) {
            for (int y = 0; y < height; y++) {
                int rgba = image.getRGB(x, y);
                Color color = new Color(rgba, true);
                Color invertedColor =
                        new Color(
                                255 - color.getRed(),
                                255 - color.getGreen(),
                                255 - color.getBlue());
                image.setRGB(x, y, invertedColor.getRGB());
            }
        }
    }

    // Helper method to convert BufferedImage to InputStream
    private File convertToBufferedImageTpFile(BufferedImage image) throws IOException {
        File file = File.createTempFile("image", ".png");
        ImageIO.write(image, "png", file);
        return file;
    }
}
