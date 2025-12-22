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
                throw ExceptionUtils.createPdfNoPages();
            }

            return createCbzFromPdf(document, dpi);
        }
    }

    private static void validatePdfFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ExceptionUtils.createFileNullOrEmptyException();
        }

        String filename = file.getOriginalFilename();
        if (filename == null) {
            throw ExceptionUtils.createFileNoNameException();
        }

        String extension = FilenameUtils.getExtension(filename).toLowerCase(Locale.ROOT);
        if (!"pdf".equals(extension)) {
            throw ExceptionUtils.createPdfFileRequiredException();
        }
    }

    private static byte[] createCbzFromPdf(PDDocument document, int dpi) throws IOException {
        PDFRenderer pdfRenderer = new PDFRenderer(document);

        try (ByteArrayOutputStream cbzOutputStream = new ByteArrayOutputStream();
                ZipOutputStream zipOut = new ZipOutputStream(cbzOutputStream)) {

            int totalPages = document.getNumberOfPages();

            for (int pageIndex = 0; pageIndex < totalPages; pageIndex++) {
                final int currentPage = pageIndex;
                try {
                    BufferedImage image =
                            ExceptionUtils.handleOomRendering(
                                    currentPage + 1,
                                    dpi,
                                    () ->
                                            pdfRenderer.renderImageWithDPI(
                                                    currentPage, dpi, ImageType.RGB));

                    String imageFilename =
                            String.format(Locale.ROOT, "page_%03d.png", currentPage + 1);
                    ZipEntry zipEntry = new ZipEntry(imageFilename);
                    zipOut.putNextEntry(zipEntry);

                    ImageIO.write(image, "PNG", zipOut);
                    zipOut.closeEntry();

                } catch (ExceptionUtils.OutOfMemoryDpiException e) {
                    // Re-throw OOM exceptions without wrapping
                    throw e;
                } catch (IOException e) {
                    // Wrap other IOExceptions with context
                    throw ExceptionUtils.createFileProcessingException(
                            "CBZ creation for page " + (currentPage + 1), e);
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
