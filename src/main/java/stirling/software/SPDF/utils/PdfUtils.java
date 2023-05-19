package stirling.software.SPDF.utils;

import java.awt.Graphics;
import java.awt.image.BufferedImage;
import java.awt.image.BufferedImageOp;
import java.awt.image.ColorConvertOp;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyPair;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

public class PdfUtils {

    private static final Logger logger = LoggerFactory.getLogger(PdfUtils.class);

    public static ResponseEntity<byte[]> boasToWebResponse(ByteArrayOutputStream baos, String docName) throws IOException {
        return PdfUtils.bytesToWebResponse(baos.toByteArray(), docName);
    }

    public static ResponseEntity<byte[]> boasToWebResponse(ByteArrayOutputStream baos, String docName, MediaType mediaType) throws IOException {
        return PdfUtils.bytesToWebResponse(baos.toByteArray(), docName, mediaType);
    }

    public static ResponseEntity<byte[]> bytesToWebResponse(byte[] bytes, String docName, MediaType mediaType) throws IOException {

        // Return the PDF as a response
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(mediaType);
        headers.setContentLength(bytes.length);
        String encodedDocName = URLEncoder.encode(docName, StandardCharsets.UTF_8.toString()).replaceAll("\\+", "%20");
        headers.setContentDispositionFormData("attachment", encodedDocName);
        return new ResponseEntity<>(bytes, headers, HttpStatus.OK);
    }

    public static ResponseEntity<byte[]> bytesToWebResponse(byte[] bytes, String docName) throws IOException {
        return bytesToWebResponse(bytes, docName, MediaType.APPLICATION_PDF);
    }

    public static byte[] convertFromPdf(byte[] inputStream, String imageType, ImageType colorType, boolean singleImage, int DPI) throws IOException, Exception {
        try (PDDocument document = PDDocument.load(new ByteArrayInputStream(inputStream))) {
            PDFRenderer pdfRenderer = new PDFRenderer(document);
            int pageCount = document.getNumberOfPages();
            List<BufferedImage> images = new ArrayList<>();

            // Create images of all pages
            for (int i = 0; i < pageCount; i++) {
                images.add(pdfRenderer.renderImageWithDPI(i, 300, colorType));
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
                            zos.putNextEntry(new ZipEntry(String.format("page_%d.%s", i + 1, imageType.toLowerCase())));
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
                String originalFilename = file.getOriginalFilename();
                if (originalFilename != null && (originalFilename.toLowerCase().endsWith(".tiff") || originalFilename.toLowerCase().endsWith(".tif")) ) {
                    ImageReader reader = ImageIO.getImageReadersByFormatName("tiff").next();
                    reader.setInput(ImageIO.createImageInputStream(file.getInputStream()));
                    int numPages = reader.getNumImages(true);
                    for (int i = 0; i < numPages; i++) {
                        BufferedImage pageImage = reader.read(i);
                        BufferedImage convertedImage = convertColorType(pageImage, colorType);
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
                        BufferedImage convertedImage = convertColorType(image, colorType);
                        PDImageXObject pdImage = LosslessFactory.createFromImage(doc, convertedImage);
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

    private static BufferedImage convertColorType(BufferedImage sourceImage, String colorType) {
        BufferedImage convertedImage;
        switch (colorType) {
            case "greyscale":
                convertedImage = new BufferedImage(sourceImage.getWidth(), sourceImage.getHeight(), BufferedImage.TYPE_BYTE_GRAY);
                convertedImage.getGraphics().drawImage(sourceImage, 0, 0, null);
                break;
            case "blackwhite":
                convertedImage = new BufferedImage(sourceImage.getWidth(), sourceImage.getHeight(), BufferedImage.TYPE_BYTE_BINARY);
                convertedImage.getGraphics().drawImage(sourceImage, 0, 0, null);
                break;
            default:  // full color
                convertedImage = sourceImage;
                break;
        }
        return convertedImage;
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

    public static X509Certificate[] loadCertificateChainFromKeystore(InputStream keystoreInputStream, String keystorePassword) throws Exception {
        KeyStore keystore = KeyStore.getInstance(KeyStore.getDefaultType());
        keystore.load(keystoreInputStream, keystorePassword.toCharArray());

        String alias = keystore.aliases().nextElement();
        Certificate[] certChain = keystore.getCertificateChain(alias);
        X509Certificate[] x509CertChain = new X509Certificate[certChain.length];

        for (int i = 0; i < certChain.length; i++) {
            x509CertChain[i] = (X509Certificate) certChain[i];
        }

        return x509CertChain;
    }

    public static KeyPair loadKeyPairFromKeystore(InputStream keystoreInputStream, String keystorePassword) throws Exception {
        KeyStore keystore = KeyStore.getInstance(KeyStore.getDefaultType());
        keystore.load(keystoreInputStream, keystorePassword.toCharArray());

        String alias = keystore.aliases().nextElement();
        PrivateKey privateKey = (PrivateKey) keystore.getKey(alias, keystorePassword.toCharArray());
        Certificate cert = keystore.getCertificate(alias);
        PublicKey publicKey = cert.getPublicKey();

        return new KeyPair(publicKey, privateKey);
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

    public static ResponseEntity<byte[]> pdfDocToWebResponse(PDDocument document, String docName) throws IOException {

        // Open Byte Array and save document to it
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        // Close the document
        document.close();

        return PdfUtils.boasToWebResponse(baos, docName);
    }
    
    public static Long convertSizeToBytes(String sizeStr) {
        if (sizeStr == null) {
            return null;
        }

        sizeStr = sizeStr.trim().toUpperCase();
        try {
            if (sizeStr.endsWith("KB")) {
                return Long.parseLong(sizeStr.substring(0, sizeStr.length() - 2)) * 1024;
            } else if (sizeStr.endsWith("MB")) {
                return Long.parseLong(sizeStr.substring(0, sizeStr.length() - 2)) * 1024 * 1024;
            } else if (sizeStr.endsWith("GB")) {
                return Long.parseLong(sizeStr.substring(0, sizeStr.length() - 2)) * 1024 * 1024 * 1024;
            } else if (sizeStr.endsWith("B")) {
                return Long.parseLong(sizeStr.substring(0, sizeStr.length() - 1));
            } else {
                // Input string does not have a valid format, handle this case
            }
        } catch (NumberFormatException e) {
            // The numeric part of the input string cannot be parsed, handle this case
        }
        
        return null;
    }
    
}
