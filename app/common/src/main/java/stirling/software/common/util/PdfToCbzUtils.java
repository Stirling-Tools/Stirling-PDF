package stirling.software.common.util;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;

import org.apache.commons.io.FilenameUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;

@Slf4j
public class PdfToCbzUtils {

    public static byte[] convertPdfToCbz(
            MultipartFile pdfFile, int dpi, CustomPDFDocumentFactory pdfDocumentFactory)
            throws IOException {

        validatePdfFile(pdfFile);

        try (PDDocument document = pdfDocumentFactory.load(pdfFile)) {
            if (document.getNumberOfPages() == 0) {
                throw new IllegalArgumentException("PDF file contains no pages");
            }

            return createCbzFromPdf(document, dpi);
        }
    }

    private static void validatePdfFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File cannot be null or empty");
        }

        String filename = file.getOriginalFilename();
        if (filename == null) {
            throw new IllegalArgumentException("File must have a name");
        }

        String extension = FilenameUtils.getExtension(filename).toLowerCase(Locale.ROOT);
        if (!"pdf".equals(extension)) {
            throw new IllegalArgumentException("File must be a PDF");
        }
    }

    private static byte[] createCbzFromPdf(PDDocument document, int dpi) throws IOException {
        PDFRenderer pdfRenderer = new PDFRenderer(document);

        try (ByteArrayOutputStream cbzOutputStream = new ByteArrayOutputStream();
                ZipOutputStream zipOut = new ZipOutputStream(cbzOutputStream)) {

            int totalPages = document.getNumberOfPages();

            for (int pageIndex = 0; pageIndex < totalPages; pageIndex++) {
                try {
                    BufferedImage image =
                            pdfRenderer.renderImageWithDPI(pageIndex, dpi, ImageType.RGB);

                    String imageFilename =
                            String.format(Locale.ROOT, "page_%03d.png", pageIndex + 1);

                    ZipEntry zipEntry = new ZipEntry(imageFilename);
                    zipOut.putNextEntry(zipEntry);

                    ImageIO.write(image, "PNG", zipOut);
                    zipOut.closeEntry();

                } catch (IOException e) {
                    log.warn("Error processing page {}: {}", pageIndex + 1, e.getMessage());
                } catch (OutOfMemoryError e) {
                    throw ExceptionUtils.createOutOfMemoryDpiException(pageIndex + 1, dpi, e);
                } catch (NegativeArraySizeException e) {
                    throw ExceptionUtils.createOutOfMemoryDpiException(pageIndex + 1, dpi, e);
                }
            }

            zipOut.finish();
            return cbzOutputStream.toByteArray();
        }
    }

    public static boolean isPdfFile(MultipartFile file) {
        String filename = file.getOriginalFilename();
        if (filename == null) {
            return false;
        }

        String extension = FilenameUtils.getExtension(filename).toLowerCase(Locale.ROOT);
        return "pdf".equals(extension);
    }
}
