package stirling.software.common.util.misc;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.core.io.InputStreamResource;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.common.util.ApplicationContextProvider;
import stirling.software.common.util.ExceptionUtils;

public class InvertFullColorStrategy extends ReplaceAndInvertColorStrategy {

    public InvertFullColorStrategy(MultipartFile file, ReplaceAndInvert replaceAndInvert) {
        super(file, replaceAndInvert);
    }

    @Override
    public InputStreamResource replace() throws IOException {
        try (TempFile tempFile =
                new TempFile(
                        Files.createTempFile("temp", getFileInput().getOriginalFilename())
                                .toFile())) {
            // Transfer the content of the multipart file to the file
            getFileInput().transferTo(tempFile.getFile());

            // Load the uploaded PDF
            try (PDDocument document = Loader.loadPDF(tempFile.getFile())) {
                // Render each page and invert colors
                PDFRenderer pdfRenderer = new PDFRenderer(document);
                for (int page = 0; page < document.getNumberOfPages(); page++) {
                    BufferedImage image;

                    // Use global maximum DPI setting, fallback to 300 if not set
                    int renderDpi = 300; // Default fallback
                    ApplicationProperties properties =
                            ApplicationContextProvider.getBean(ApplicationProperties.class);
                    if (properties != null && properties.getSystem() != null) {
                        renderDpi = properties.getSystem().getMaxDPI();
                    }
                    final int dpi = renderDpi;
                    final int pageNum = page;

                    image =
                            ExceptionUtils.handleOomRendering(
                                    pageNum + 1,
                                    dpi,
                                    () -> pdfRenderer.renderImageWithDPI(pageNum, dpi));

                    // Invert the colors
                    invertImageColors(image);

                    // Create a new PDPage from the inverted image
                    PDPage pdPage = document.getPage(page);
                    File tempImageFile = null;
                    try {
                        tempImageFile = convertToBufferedImageTpFile(image);
                        PDImageXObject pdImage =
                                PDImageXObject.createFromFileByContent(tempImageFile, document);

                        try (PDPageContentStream contentStream =
                                new PDPageContentStream(
                                        document,
                                        pdPage,
                                        PDPageContentStream.AppendMode.OVERWRITE,
                                        true)) {
                            contentStream.drawImage(
                                    pdImage,
                                    0,
                                    0,
                                    pdPage.getMediaBox().getWidth(),
                                    pdPage.getMediaBox().getHeight());
                        }
                    } finally {
                        if (tempImageFile != null && tempImageFile.exists()) {
                            Files.delete(tempImageFile.toPath());
                        }
                    }
                }

                // Save the modified PDF to a ByteArrayOutputStream
                ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
                document.save(byteArrayOutputStream);

                // Prepare the modified PDF for download
                ByteArrayInputStream inputStream =
                        new ByteArrayInputStream(byteArrayOutputStream.toByteArray());
                InputStreamResource resource = new InputStreamResource(inputStream);
                return resource;
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

    private static class TempFile implements AutoCloseable {
        private final File file;

        public TempFile(File file) {
            this.file = file;
        }

        public File getFile() {
            return file;
        }

        @Override
        public void close() throws IOException {
            if (file != null && file.exists()) {
                Files.delete(file.toPath());
            }
        }
    }
}
