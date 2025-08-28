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
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.core.io.InputStreamResource;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ApplicationContextProvider;

public class InvertFullColorStrategy extends ReplaceAndInvertColorStrategy {

    public InvertFullColorStrategy(MultipartFile file, ReplaceAndInvert replaceAndInvert) {
        super(file, replaceAndInvert);
    }

    /**
     * Calculate safe DPI to prevent memory issues based on page size
     */
    private int calculateSafeDPI(PDRectangle mediaBox, int requestedDPI) {
        // Maximum safe image dimensions to prevent OOM
        final int MAX_WIDTH = 8192;
        final int MAX_HEIGHT = 8192;
        final long MAX_PIXELS = 16_777_216; // 4096x4096
        
        float pageWidthPts = mediaBox.getWidth();
        float pageHeightPts = mediaBox.getHeight();
        
        // Calculate projected dimensions at requested DPI
        int projectedWidth = (int) Math.ceil(pageWidthPts * requestedDPI / 72.0);
        int projectedHeight = (int) Math.ceil(pageHeightPts * requestedDPI / 72.0);
        long projectedPixels = (long) projectedWidth * projectedHeight;
        
        // Calculate scaling factors if needed
        if (projectedWidth <= MAX_WIDTH && projectedHeight <= MAX_HEIGHT && projectedPixels <= MAX_PIXELS) {
            return requestedDPI; // Safe to use requested DPI
        }
        
        double widthScale = (double) MAX_WIDTH / projectedWidth;
        double heightScale = (double) MAX_HEIGHT / projectedHeight;
        double pixelScale = Math.sqrt((double) MAX_PIXELS / projectedPixels);
        double minScale = Math.min(Math.min(widthScale, heightScale), pixelScale);
        
        return (int) Math.max(72, requestedDPI * minScale);
    }

    @Override
    public InputStreamResource replace() throws IOException {

        File file = null;
        try {
            // Create a temporary file, with the original filename from the multipart file
            file = Files.createTempFile("temp", getFileInput().getOriginalFilename()).toFile();

            // Transfer the content of the multipart file to the file
            getFileInput().transferTo(file);

            // Get PDF document factory and load the uploaded PDF with memory-safe settings
            CustomPDFDocumentFactory pdfDocumentFactory = 
                ApplicationContextProvider.getBean(CustomPDFDocumentFactory.class);
            PDDocument document = pdfDocumentFactory.load(file);

            // Render each page and invert colors with memory safety
            PDFRenderer pdfRenderer = new PDFRenderer(document);
            pdfRenderer.setSubsamplingAllowed(true);
            
            for (int page = 0; page < document.getNumberOfPages(); page++) {
                PDPage pdPage = document.getPage(page);
                PDRectangle mediaBox = pdPage.getMediaBox();
                
                // Calculate safe DPI to prevent memory issues
                int safeDPI = calculateSafeDPI(mediaBox, 300);
                
                BufferedImage image;
                try {
                    image = pdfRenderer.renderImageWithDPI(page, safeDPI, ImageType.RGB);
                } catch (IllegalArgumentException e) {
                    if (e.getMessage() != null && e.getMessage().contains("Maximum size of image exceeded")) {
                        // Fall back to lower DPI if still too large
                        safeDPI = Math.max(72, safeDPI / 2);
                        image = pdfRenderer.renderImageWithDPI(page, safeDPI, ImageType.RGB);
                    } else {
                        throw e;
                    }
                }

                // Invert the colors
                invertImageColors(image);

                // Create a new PDPage from the inverted image
                File tempImageFile = null;
                try {
                    tempImageFile = convertToBufferedImageTpFile(image);
                    PDImageXObject pdImage =
                            PDImageXObject.createFromFileByContent(tempImageFile, document);

                    PDPageContentStream contentStream =
                            new PDPageContentStream(
                                    document,
                                    pdPage,
                                    PDPageContentStream.AppendMode.OVERWRITE,
                                    true);
                    contentStream.drawImage(
                            pdImage,
                            0,
                            0,
                            pdPage.getMediaBox().getWidth(),
                            pdPage.getMediaBox().getHeight());
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
