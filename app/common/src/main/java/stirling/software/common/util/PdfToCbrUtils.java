package stirling.software.common.util;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

import javax.imageio.ImageIO;

import org.apache.commons.io.FilenameUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;

@Slf4j
public class PdfToCbrUtils {

    public static byte[] convertPdfToCbr(
            MultipartFile pdfFile, int dpi, CustomPDFDocumentFactory pdfDocumentFactory)
            throws IOException {

        validatePdfFile(pdfFile);

        try (PDDocument document = pdfDocumentFactory.load(pdfFile)) {
            if (document.getNumberOfPages() == 0) {
                throw new IllegalArgumentException("PDF file contains no pages");
            }

            return createCbrFromPdf(document, dpi);
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

    private static byte[] createCbrFromPdf(PDDocument document, int dpi) throws IOException {
        PDFRenderer pdfRenderer = new PDFRenderer(document);

        Path tempDir = Files.createTempDirectory("stirling-pdf-cbr-");
        List<Path> generatedImages = new ArrayList<>();
        try {
            int totalPages = document.getNumberOfPages();

            for (int pageIndex = 0; pageIndex < totalPages; pageIndex++) {
                try {
                    BufferedImage image =
                            pdfRenderer.renderImageWithDPI(pageIndex, dpi, ImageType.RGB);

                    String imageFilename =
                            String.format(Locale.ROOT, "page_%03d.png", pageIndex + 1);
                    Path imagePath = tempDir.resolve(imageFilename);

                    ImageIO.write(image, "PNG", imagePath.toFile());
                    generatedImages.add(imagePath);

                } catch (IOException e) {
                    log.warn("Error processing page {}: {}", pageIndex + 1, e.getMessage());
                } catch (OutOfMemoryError e) {
                    throw ExceptionUtils.createOutOfMemoryDpiException(pageIndex + 1, dpi, e);
                } catch (NegativeArraySizeException e) {
                    throw ExceptionUtils.createOutOfMemoryDpiException(pageIndex + 1, dpi, e);
                }
            }

            if (generatedImages.isEmpty()) {
                throw new IOException("Failed to render any pages to images for CBR conversion");
            }

            return createRarArchive(tempDir, generatedImages);
        } finally {
            cleanupTempFiles(generatedImages, tempDir);
        }
    }

    private static byte[] createRarArchive(Path tempDir, List<Path> images) throws IOException {
        List<String> command = new ArrayList<>();
        command.add("rar");
        command.add("a");
        command.add("-m5");
        command.add("-ep1");

        Path rarFile = tempDir.resolve("output.cbr");
        command.add(rarFile.getFileName().toString());

        for (Path image : images) {
            command.add(image.getFileName().toString());
        }

        ProcessExecutor executor =
                ProcessExecutor.getInstance(ProcessExecutor.Processes.INSTALL_APP);
        try {
            ProcessExecutorResult result =
                    executor.runCommandWithOutputHandling(command, tempDir.toFile());
            if (result.getRc() != 0) {
                throw new IOException("RAR command failed: " + result.getMessages());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("RAR command interrupted", e);
        }

        if (!Files.exists(rarFile)) {
            throw new IOException("RAR file was not created");
        }

        try (FileInputStream fis = new FileInputStream(rarFile.toFile());
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            fis.transferTo(baos);
            return baos.toByteArray();
        }
    }

    private static void cleanupTempFiles(List<Path> images, Path tempDir) {
        for (Path image : images) {
            try {
                Files.deleteIfExists(image);
            } catch (IOException e) {
                log.warn("Failed to delete temp image file {}: {}", image, e.getMessage());
            }
        }
        if (tempDir != null) {
            try (var paths = Files.walk(tempDir)) {
                paths.sorted(Comparator.reverseOrder())
                        .forEach(
                                path -> {
                                    try {
                                        Files.deleteIfExists(path);
                                    } catch (IOException e) {
                                        log.warn(
                                                "Failed to delete temp path {}: {}",
                                                path,
                                                e.getMessage());
                                    }
                                });
            } catch (IOException e) {
                log.warn("Failed to clean up temp directory {}: {}", tempDir, e.getMessage());
            }
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
