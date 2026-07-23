package stirling.software.common.util;

import java.io.IOException;
import java.nio.file.Files;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.commons.io.FilenameUtils;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.jpdfium.PdfDocument;

@Slf4j
public class PdfToCbzUtils {

    public static TempFile convertPdfToCbz(
            MultipartFile pdfFile,
            int dpi,
            CustomPDFDocumentFactory pdfDocumentFactory,
            TempFileManager tempFileManager)
            throws IOException {

        validatePdfFile(pdfFile);

        try (TempFile tempFile = new TempFile(tempFileManager, ".pdf")) {
            pdfFile.transferTo(tempFile.getFile());
            try (PdfDocument document = PdfDocument.open(tempFile.getPath())) {
                if (document.pageCount() == 0) {
                    throw ExceptionUtils.createPdfNoPages();
                }

                return createCbzFromPdf(document, dpi, tempFileManager);
            }
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
            PdfDocument document, int dpi, TempFileManager tempFileManager) throws IOException {
        TempFile cbzTempFile = new TempFile(tempFileManager, ".cbz");
        try {
            try (ZipOutputStream zipOut =
                    new ZipOutputStream(Files.newOutputStream(cbzTempFile.getPath()))) {

                int totalPages = document.pageCount();

                for (int pageIndex = 0; pageIndex < totalPages; pageIndex++) {
                    final int currentPage = pageIndex;
                    try {
                        byte[] imageBytes =
                                RenderingUtils.renderPageToBytes(document, currentPage, dpi, "png");

                        String imageFilename =
                                String.format(Locale.ROOT, "page_%03d.png", currentPage + 1);
                        zipOut.putNextEntry(new ZipEntry(imageFilename));
                        zipOut.write(imageBytes);
                        zipOut.closeEntry();

                    } catch (OutOfMemoryError e) {
                        throw ExceptionUtils.createOutOfMemoryDpiException(currentPage + 1, dpi, e);
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
