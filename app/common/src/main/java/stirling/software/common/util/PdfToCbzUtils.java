package stirling.software.common.util;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.*;
import java.util.stream.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;

import org.apache.commons.io.FilenameUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;

@Slf4j
public class PdfToCbzUtils {

    public static byte[] convertPdfToCbz(
            MultipartFile pdfFile, int dpi, CustomPDFDocumentFactory pdfDocumentFactory)
            throws IOException {

        validatePdfFile(pdfFile);
        byte[] pdfData = pdfFile.getBytes();

        try (PDDocument document = pdfDocumentFactory.load(pdfData)) {
            int totalPages = document.getNumberOfPages();
            if (totalPages == 0) {
                throw ExceptionUtils.createPdfNoPages();
            }

            return createCbzFromPdf(pdfDocumentFactory, pdfData, totalPages, dpi);
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

    private static byte[] createCbzFromPdf(
            CustomPDFDocumentFactory pdfDocumentFactory, byte[] pdfData, int totalPages, int dpi)
            throws IOException {

        try (ByteArrayOutputStream cbzOutputStream = new ByteArrayOutputStream();
                ZipOutputStream zipOut = new ZipOutputStream(cbzOutputStream)) {

            int configuredParallelism =
                    Math.min(64, Math.max(2, Runtime.getRuntime().availableProcessors() * 2));
            int desiredParallelism = Math.max(1, Math.min(totalPages, configuredParallelism));

            try (ManagedForkJoinPool managedPool = new ManagedForkJoinPool(desiredParallelism);
                    PdfThreadLocalResources renderingResources =
                            new PdfThreadLocalResources(pdfDocumentFactory, pdfData)) {
                ForkJoinPool customPool = managedPool.getPool();

                // Process in batches to save memory
                int batchSize = 10;
                for (int i = 0; i < totalPages; i += batchSize) {
                    int start = i;
                    int end = Math.min(totalPages, i + batchSize);

                    List<byte[]> batchImages =
                            customPool
                                    .submit(
                                            () ->
                                                    IntStream.range(start, end)
                                                            .parallel()
                                                            .mapToObj(
                                                                    pageNum -> {
                                                                        try {
                                                                            BufferedImage image =
                                                                                    ExceptionUtils
                                                                                            .handleOomRendering(
                                                                                                    pageNum
                                                                                                            + 1,
                                                                                                    dpi,
                                                                                                    () ->
                                                                                                            renderingResources
                                                                                                                    .renderPage(
                                                                                                                            pageNum,
                                                                                                                            dpi,
                                                                                                                            org
                                                                                                                                    .apache
                                                                                                                                    .pdfbox
                                                                                                                                    .rendering
                                                                                                                                    .ImageType
                                                                                                                                    .RGB));
                                                                            try (ByteArrayOutputStream
                                                                                    pageBaos =
                                                                                            new ByteArrayOutputStream()) {
                                                                                ImageIO.write(
                                                                                        image,
                                                                                        "PNG",
                                                                                        pageBaos);
                                                                                image.flush();
                                                                                return pageBaos
                                                                                        .toByteArray();
                                                                            }
                                                                        } catch (Exception e) {
                                                                            throw new RuntimeException(
                                                                                    e);
                                                                        }
                                                                    })
                                                            .collect(Collectors.toList()))
                                    .get();

                    for (int j = 0; j < batchImages.size(); j++) {
                        int pageNum = start + j;
                        String imageFilename =
                                String.format(Locale.ROOT, "page_%03d.png", pageNum + 1);
                        ZipEntry zipEntry = new ZipEntry(imageFilename);
                        zipOut.putNextEntry(zipEntry);
                        zipOut.write(batchImages.get(j));
                        zipOut.closeEntry();
                    }
                }
            } catch (ExecutionException | InterruptedException e) {
                throw new IOException("Error during parallel CBZ rendering", e);
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
