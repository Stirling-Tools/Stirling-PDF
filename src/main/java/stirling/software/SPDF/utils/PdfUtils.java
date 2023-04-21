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

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
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

import java.io.InputStream;
import java.security.KeyPair;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;

public class PdfUtils {

    private static final Logger logger = LoggerFactory.getLogger(PdfUtils.class);

    public static byte[] imageToPdf(MultipartFile[] files, boolean stretchToFit, boolean autoRotate) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (MultipartFile file : files) {
                // Create a temporary file for the image
                File imageFile = Files.createTempFile("image", ".jpg").toFile();

                try (FileOutputStream fos = new FileOutputStream(imageFile); InputStream input = file.getInputStream()) {
                    byte[] buffer = new byte[1024];
                    int len;
                    // Read from the input stream and write to the file
                    while ((len = input.read(buffer)) != -1) {
                        fos.write(buffer, 0, len);
                    }
                    logger.info("Image successfully written to file: {}", imageFile.getAbsolutePath());
                } catch (IOException e) {
                    logger.error("Error writing image to file: {}", imageFile.getAbsolutePath(), e);
                    throw e;
                }

                // Create a new PDF page
                PDPage page = new PDPage();
                doc.addPage(page);

                // Create an image object from the image file
                PDImageXObject image = PDImageXObject.createFromFileByContent(imageFile, doc);

                float pageWidth = page.getMediaBox().getWidth();
                float pageHeight = page.getMediaBox().getHeight();

                if (autoRotate && ((image.getWidth() > image.getHeight() && pageHeight > pageWidth) || (image.getWidth() < image.getHeight() && pageWidth > pageHeight))) {
                    // Rotate the page 90 degrees if the image better fits the page in landscape orientation
                    page.setRotation(90);
                    pageWidth = page.getMediaBox().getHeight();
                    pageHeight = page.getMediaBox().getWidth();
                }

                try (PDPageContentStream contentStream = new PDPageContentStream(doc, page)) {
                    if (stretchToFit) {
                        if (page.getRotation() == 0 || page.getRotation() == 180) {
                            // Stretch the image to fit the whole page
                            contentStream.drawImage(image, 0, 0, pageWidth, pageHeight);
                        } else {
                            // Adjust the width and height of the page when rotated
                            contentStream.drawImage(image, 0, 0, pageHeight, pageWidth);
                        }
                        logger.info("Image successfully added to PDF, stretched to fit page");
                    } else {
                        // Ensure the image fits the page but maintain the image's aspect ratio
                        float imageAspectRatio = (float) image.getWidth() / (float) image.getHeight();
                        float pageAspectRatio = pageWidth / pageHeight;

                        // Determine the scale factor to fit the image onto the page
                        float scaleFactor = 1.0f;
                        if (imageAspectRatio > pageAspectRatio) {
                            // Image is wider than the page, scale to fit the width
                            scaleFactor = pageWidth / image.getWidth();
                        } else {
                            // Image is taller than the page, scale to fit the height
                            scaleFactor = pageHeight / image.getHeight();
                        }

                        // Calculate the position of the image on the page
                        float xPos = (pageWidth - (image.getWidth() * scaleFactor)) / 2;
                        float yPos = (pageHeight - (image.getHeight() * scaleFactor)) / 2;

                        // Draw the image onto the page
                        if (page.getRotation() == 0 || page.getRotation() == 180) {
                            contentStream.drawImage(image, xPos, yPos, image.getWidth() * scaleFactor, image.getHeight() * scaleFactor);
                        } else {
                            // Adjust the width and height of the page when rotated
                            contentStream.drawImage(image, yPos, xPos, image.getHeight() * scaleFactor, image.getWidth() * scaleFactor);
                        }
                        logger.info("Image successfully added to PDF, maintaining aspect ratio");
                    }
                } catch (IOException e) {
                    logger.error("Error adding image to PDF", e);
                    throw e;
                }

                // Delete the temporary file
                imageFile.delete();
            }

            // Create a ByteArrayOutputStream to save the PDF to
            ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
            doc.save(byteArrayOutputStream);
            logger.info("PDF successfully saved to byte array");

            return byteArrayOutputStream.toByteArray();
        }

    }


    public static byte[] convertFromPdf(byte[] inputStream, String imageType, ImageType colorType, boolean singleImage, int DPI)
            throws IOException, Exception {
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
                    if (everyPage == false && i == 0) {
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

    public static ResponseEntity<byte[]> boasToWebResponse(ByteArrayOutputStream baos, String docName) throws IOException {
        return PdfUtils.bytesToWebResponse(baos.toByteArray(), docName);

    }

    public static ResponseEntity<byte[]> bytesToWebResponse(byte[] bytes, String docName) throws IOException {

        // Return the PDF as a response
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentLength(bytes.length);
        headers.setContentDispositionFormData("attachment", docName);
        return new ResponseEntity<>(bytes, headers, HttpStatus.OK);
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
}
