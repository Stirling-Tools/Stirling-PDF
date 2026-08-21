package stirling.software.common.util;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
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

    public static TempFile convertPdfToCbz(
            MultipartFile pdfFile,
            int dpi,
            CustomPDFDocumentFactory pdfDocumentFactory,
            TempFileManager tempFileManager)
            throws IOException {

        validatePdfFile(pdfFile);

        try (PDDocument document = pdfDocumentFactory.load(pdfFile)) {
            if (document.getNumberOfPages() == 0) {
                throw ExceptionUtils.createPdfNoPages();
            }

            return createCbzFromPdf(document, dpi, tempFileManager);
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

    private static TempFile createCbzFromPdf(
            PDDocument document, int dpi, TempFileManager tempFileManager) throws IOException {
        PDFRenderer pdfRenderer = new PDFRenderer(document);
        pdfRenderer.setSubsamplingAllowed(true); // Enable subsampling to reduce memory usage

        TempFile cbzTempFile = new TempFile(tempFileManager, ".cbz");
        try {
            try (ZipOutputStream zipOut =
                    new ZipOutputStream(Files.newOutputStream(cbzTempFile.getPath()))) {

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
                        zipOut.putNextEntry(new ZipEntry(imageFilename));
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
            }
            return cbzTempFile;
        } catch (Exception e) {
            cbzTempFile.close();
            throw e;
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
