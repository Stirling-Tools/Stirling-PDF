package stirling.software.SPDF.controller.api.misc;

import java.awt.AlphaComposite;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.geom.Ellipse2D;
import java.awt.geom.Path2D;
import java.awt.image.AffineTransformOp;
import java.awt.image.BufferedImage;
import java.awt.image.BufferedImageOp;
import java.awt.image.ConvolveOp;
import java.awt.image.Kernel;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.PDFFile;
import stirling.software.SPDF.utils.PdfUtils;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class FakeScanControllerWIP {

    private static final Logger logger = LoggerFactory.getLogger(FakeScanControllerWIP.class);

    // TODO finish
    @PostMapping(consumes = "multipart/form-data", value = "/fake-scan")
    @Hidden
    @Operation(
            summary = "Repair a PDF file",
            description =
                    "This endpoint repairs a given PDF file by running Ghostscript command. The PDF is first saved to a temporary location, repaired, read back, and then returned as a response.")
    public ResponseEntity<byte[]> fakeScan(@ModelAttribute PDFFile request) throws IOException {
        MultipartFile inputFile = request.getFileInput();

        // Load the PDF document
        PDDocument document = Loader.loadPDF(inputFile.getBytes());
        PDFRenderer renderer = new PDFRenderer(document);
        List<BufferedImage> images = new ArrayList<>();
        // Convert each page to an image
        for (int i = 0; i < document.getNumberOfPages(); i++) {
            BufferedImage image = renderer.renderImageWithDPI(i, 150, ImageType.GRAY);
            images.add(processImage(image));
        }
        document.close();

        // Create a new PDF document with the processed images
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PDDocument newDocument = new PDDocument();
        for (BufferedImage img : images) {
            // PDPageContentStream contentStream = new PDPageContentStream(newDocument, new
            // PDPage());
            PDImageXObject pdImage = JPEGFactory.createFromImage(newDocument, img);
            PdfUtils.addImageToDocument(newDocument, pdImage, "maintainAspectRatio", false);
        }

        newDocument.save(baos);
        newDocument.close();

        // Return the optimized PDF as a response
        String outputFilename =
                Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                .replaceFirst("[.][^.]+$", "")
                        + "_scanned.pdf";
        return WebResponseUtils.boasToWebResponse(baos, outputFilename);
    }

    public BufferedImage processImage(BufferedImage image) {
        // Rotation

        image = softenEdges(image, 50);
        image = rotate(image, 1);

        image = applyGaussianBlur(image, 0.5);
        addGaussianNoise(image, 0.5);
        image = linearStretch(image);
        addDustAndHairs(image, 3);
        return image;
    }

    private BufferedImage rotate(BufferedImage image, double rotation) {

        double rotationRequired = Math.toRadians(rotation);
        double locationX = image.getWidth() / 2;
        double locationY = image.getHeight() / 2;
        AffineTransform tx =
                AffineTransform.getRotateInstance(rotationRequired, locationX, locationY);
        AffineTransformOp op = new AffineTransformOp(tx, AffineTransformOp.TYPE_BICUBIC);
        return op.filter(image, null);
    }

    private BufferedImage applyGaussianBlur(BufferedImage image, double sigma) {
        int radius = 3; // Fixed radius size for simplicity

        int size = 2 * radius + 1;
        float[] data = new float[size * size];
        double sum = 0.0;

        for (int i = -radius; i <= radius; i++) {
            for (int j = -radius; j <= radius; j++) {
                double xDistance = i * i;
                double yDistance = j * j;
                double g = Math.exp(-(xDistance + yDistance) / (2 * sigma * sigma));
                data[(i + radius) * size + j + radius] = (float) g;
                sum += g;
            }
        }

        // Normalize the kernel
        for (int i = 0; i < data.length; i++) {
            data[i] /= sum;
        }

        Kernel kernel = new Kernel(size, size, data);
        BufferedImageOp op = new ConvolveOp(kernel, ConvolveOp.EDGE_NO_OP, null);
        return op.filter(image, null);
    }

    public BufferedImage softenEdges(BufferedImage image, int featherRadius) {
        int width = image.getWidth();
        int height = image.getHeight();
        BufferedImage output = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);

        Graphics2D g2 = output.createGraphics();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g2.setRenderingHint(
                RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);

        g2.drawImage(image, 0, 0, null);
        g2.setComposite(AlphaComposite.DstIn);

        // Top edge
        g2.setPaint(
                new GradientPaint(
                        0,
                        0,
                        new Color(0, 0, 0, 1f),
                        0,
                        featherRadius * 2,
                        new Color(0, 0, 0, 0f)));
        g2.fillRect(0, 0, width, featherRadius);

        // Bottom edge
        g2.setPaint(
                new GradientPaint(
                        0,
                        height - featherRadius * 2,
                        new Color(0, 0, 0, 0f),
                        0,
                        height,
                        new Color(0, 0, 0, 1f)));
        g2.fillRect(0, height - featherRadius, width, featherRadius);

        // Left edge
        g2.setPaint(
                new GradientPaint(
                        0,
                        0,
                        new Color(0, 0, 0, 1f),
                        featherRadius * 2,
                        0,
                        new Color(0, 0, 0, 0f)));
        g2.fillRect(0, 0, featherRadius, height);

        // Right edge
        g2.setPaint(
                new GradientPaint(
                        width - featherRadius * 2,
                        0,
                        new Color(0, 0, 0, 0f),
                        width,
                        0,
                        new Color(0, 0, 0, 1f)));
        g2.fillRect(width - featherRadius, 0, featherRadius, height);

        g2.dispose();

        return output;
    }

    private void addDustAndHairs(BufferedImage image, float intensity) {
        int width = image.getWidth();
        int height = image.getHeight();
        Graphics2D g2d = image.createGraphics();
        Random random = new SecureRandom();

        // Set rendering hints for better quality
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        // Calculate the number of artifacts based on intensity
        int numSpots = (int) (intensity * 10);
        int numHairs = (int) (intensity * 20);

        // Add spots with more variable sizes
        g2d.setColor(new Color(100, 100, 100, 50)); // Semi-transparent gray
        for (int i = 0; i < numSpots; i++) {
            int x = random.nextInt(width);
            int y = random.nextInt(height);
            int ovalSize = 1 + random.nextInt(3); // Base size + variable component
            if (random.nextFloat() > 0.9) {
                // 10% chance to get a larger spot
                ovalSize += random.nextInt(3);
            }
            g2d.fill(new Ellipse2D.Double(x, y, ovalSize, ovalSize));
        }

        // Add hairs
        g2d.setStroke(new BasicStroke(0.5f)); // Thin stroke for hairs
        g2d.setColor(new Color(80, 80, 80, 40)); // Slightly lighter and more transparent
        for (int i = 0; i < numHairs; i++) {
            int x1 = random.nextInt(width);
            int y1 = random.nextInt(height);
            int x2 = x1 + random.nextInt(20) - 10; // Random length and direction
            int y2 = y1 + random.nextInt(20) - 10;
            Path2D.Double hair = new Path2D.Double();
            hair.moveTo(x1, y1);
            hair.curveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2, x2, y2);
            g2d.draw(hair);
        }

        g2d.dispose();
    }

    private void addGaussianNoise(BufferedImage image, double strength) {
        Random rand = new SecureRandom();
        int width = image.getWidth();
        int height = image.getHeight();

        for (int i = 0; i < width; i++) {
            for (int j = 0; j < height; j++) {
                int rgba = image.getRGB(i, j);
                int alpha = (rgba >> 24) & 0xff;
                int red = (rgba >> 16) & 0xff;
                int green = (rgba >> 8) & 0xff;
                int blue = rgba & 0xff;

                // Apply Gaussian noise
                red = (int) (red + rand.nextGaussian() * strength);
                green = (int) (green + rand.nextGaussian() * strength);
                blue = (int) (blue + rand.nextGaussian() * strength);

                // Clamping values to the 0-255 range
                red = Math.min(Math.max(0, red), 255);
                green = Math.min(Math.max(0, green), 255);
                blue = Math.min(Math.max(0, blue), 255);

                image.setRGB(i, j, (alpha << 24) | (red << 16) | (green << 8) | blue);
            }
        }
    }

    public BufferedImage linearStretch(BufferedImage image) {
        int width = image.getWidth();
        int height = image.getHeight();
        int min = 255;
        int max = 0;

        // First pass: find the min and max grayscale values
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int rgb = image.getRGB(x, y);
                int gray =
                        (int)
                                (((rgb >> 16) & 0xff) * 0.299
                                        + ((rgb >> 8) & 0xff) * 0.587
                                        + (rgb & 0xff) * 0.114); // Convert to grayscale
                if (gray < min) min = gray;
                if (gray > max) max = gray;
            }
        }

        // Second pass: stretch the histogram
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int rgb = image.getRGB(x, y);
                int alpha = (rgb >> 24) & 0xff;
                int red = (rgb >> 16) & 0xff;
                int green = (rgb >> 8) & 0xff;
                int blue = rgb & 0xff;

                // Apply linear stretch to each channel
                red = (int) (((red - min) / (float) (max - min)) * 255);
                green = (int) (((green - min) / (float) (max - min)) * 255);
                blue = (int) (((blue - min) / (float) (max - min)) * 255);

                // Set new RGB value maintaining the alpha channel
                rgb = (alpha << 24) | (red << 16) | (green << 8) | blue;
                image.setRGB(x, y, rgb);
            }
        }

        return image;
    }
}
