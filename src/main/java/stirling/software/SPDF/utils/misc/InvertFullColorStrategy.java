package stirling.software.SPDF.utils.misc;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.core.io.InputStreamResource;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.misc.ReplaceAndInvert;

public class InvertFullColorStrategy extends ReplaceAndInvertColorStrategy {

    public InvertFullColorStrategy(MultipartFile file, ReplaceAndInvert replaceAndInvert) {
        super(file, replaceAndInvert);
    }

    @Override
    public InputStreamResource replace() throws IOException {

        // Create a temporary file, with the original filename from the multipart file
        File file = File.createTempFile("temp", getFileInput().getOriginalFilename());

        // Transfer the content of the multipart file to the file
        getFileInput().transferTo(file);

        // Load the uploaded PDF
        PDDocument document = Loader.loadPDF(file);

        // Render each page and invert colors
        PDFRenderer pdfRenderer = new PDFRenderer(document);
        for (int page = 0; page < document.getNumberOfPages(); page++) {
            BufferedImage image =
                    pdfRenderer.renderImageWithDPI(page, 300); // Render page at 300 DPI

            // Invert the colors
            invertImageColors(image);

            // Create a new PDPage from the inverted image
            PDPage pdPage = document.getPage(page);
            PDImageXObject pdImage =
                    PDImageXObject.createFromFileByContent(
                            convertToBufferedImageTpFile(image), document);

            PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, pdPage, PDPageContentStream.AppendMode.OVERWRITE, true);
            contentStream.drawImage(
                    pdImage,
                    0,
                    0,
                    pdPage.getMediaBox().getWidth(),
                    pdPage.getMediaBox().getHeight());
            contentStream.close();
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
        File file = new File("image.png");
        ImageIO.write(image, "png", file);
        return file;
    }
}
