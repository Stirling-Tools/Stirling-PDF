package stirling.software.SPDF.controller.api.misc;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import org.apache.commons.io.FileUtils;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import stirling.software.SPDF.model.api.PDFExtractImagesRequest;
import stirling.software.SPDF.utils.WebResponseUtils;
import stirling.software.SPDF.utils.memoryUtils;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.awt.image.RenderedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.*;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@RestController
@RequestMapping("/api/v1/misc")
public class ExtractImagesController {

    private static final Logger logger = LoggerFactory.getLogger(ExtractImagesController.class);
    private final memoryUtils memoryutils; // Inject MemoryUtils

    @Autowired
    public ExtractImagesController(memoryUtils memoryutils) {
        this.memoryutils = memoryutils;
    }

    @PostMapping(consumes = "multipart/form-data", value = "/extract-images")
    @Operation(
            summary = "Extract images from a PDF file",
            description =
                    "This endpoint extracts images from a given PDF file and returns them in a zip file. Users can specify the output image format. Input: PDF Output: IMAGE/ZIP Type: SIMO")
    public ResponseEntity<byte[]> extractImages(@ModelAttribute PDFExtractImagesRequest request)
            throws IOException, InterruptedException, ExecutionException {
        MultipartFile file = request.getFileInput();
        String format = request.getFormat();
        int imageIndex = 1;
        logger.info(
                "Starting image extraction for file: {} with format: {}",
                file.getOriginalFilename(),
                format);

        // Create ByteArrayOutputStream to write zip file to byte array
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream();
                ZipOutputStream zos = new ZipOutputStream(baos)) {

            // Set compression level
            zos.setLevel(Deflater.BEST_COMPRESSION);

            // Create a temporary directory for processing
            Path tempDir = Files.createTempDirectory("image-processing-");
            File tempFile = null;
            PDDocument document;

            try {
                // Determine if we should use file-based storage based on available RAM
                boolean useFile = memoryutils.shouldUseFileBasedStorage();
                if (useFile) {
                    tempFile = File.createTempFile("uploaded_", ".pdf");
                    try (FileOutputStream fos = new FileOutputStream(tempFile)) {
                        fos.write(file.getBytes());
                    }
                    // Load PDF from the temporary file
                    document = Loader.loadPDF(tempFile);
                } else {
                    // Load PDF directly from the byte array (RAM)
                    document = Loader.loadPDF(file.getBytes());
                }

                String filename =
                        Filenames.toSimpleFileName(file.getOriginalFilename())
                                .replaceFirst("[.][^.]+$", "");
                Set<Integer> processedImages = new HashSet<>();

                // Determine if multithreading should be used based on PDF size or number of pages
                boolean useMultithreading = shouldUseMultithreading(file, document);

                if (useMultithreading) {
                    // Executor service to handle multithreading
                    ExecutorService executor =
                            Executors.newFixedThreadPool(
                                    Runtime.getRuntime().availableProcessors());
                    try {
                        Set<Future<Void>> futures = new HashSet<>();

                        // Iterate over each page
                        for (int pgNum = 0; pgNum < document.getPages().getCount(); pgNum++) {
                            PDPage page = document.getPage(pgNum);
                            // Submit a task for processing each page
                            Future<Void> future =
                                    executor.submit(
                                            () -> {
                                                try {
                                                    extractImagesFromPage(
                                                            page,
                                                            format,
                                                            filename,
                                                            imageIndex,
                                                            processedImages,
                                                            zos,
                                                            document);
                                                } catch (IOException e) {
                                                    logger.error(
                                                            "Error extracting images from page", e);
                                                }
                                                return null;
                                            });
                            futures.add(future);
                        }

                        // Wait for all tasks to complete
                        for (Future<Void> future : futures) {
                            future.get();
                        }

                    } finally {
                        executor.shutdown();
                        try {
                            if (!executor.awaitTermination(60, TimeUnit.SECONDS)) {
                                executor.shutdownNow();
                            }
                        } catch (InterruptedException ex) {
                            executor.shutdownNow();
                            Thread.currentThread().interrupt();
                        }
                    }
                } else {
                    // Single-threaded extraction
                    for (int pgNum = 0; pgNum < document.getPages().getCount(); pgNum++) {
                        PDPage page = document.getPage(pgNum);
                        extractImagesFromPage(
                                page, format, filename, imageIndex, processedImages, zos, document);
                    }
                }

                // Close the ZipOutputStream
                zos.finish();

                byte[] zipBytes = baos.toByteArray(); // Convert ByteArrayOutputStream to byte array

                return WebResponseUtils.bytesToWebResponse(
                        zipBytes,
                        file.getOriginalFilename() + "_extracted-images.zip",
                        MediaType.APPLICATION_OCTET_STREAM);
            } finally {
                // Clean up the temporary files and directories
                if (tempFile != null) {
                    Files.deleteIfExists(tempFile.toPath());
                }
                FileUtils.deleteDirectory(tempDir.toFile());
            }
        }
    }

    private boolean shouldUseMultithreading(MultipartFile file, PDDocument document) {
        // Criteria: Use multithreading if file size > 10MB or number of pages > 20
        long fileSizeInMB = file.getSize() / (1024 * 1024);
        int numberOfPages = document.getPages().getCount();
        return fileSizeInMB > 10 || numberOfPages > 20;
    }

    private void extractImagesFromPage(
            PDPage page,
            String format,
            String filename,
            int imageIndex,
            Set<Integer> processedImages,
            ZipOutputStream zos,
            PDDocument document)
            throws IOException {

        int pageNum = document.getPages().indexOf(page) + 1;

        for (COSName name : page.getResources().getXObjectNames()) {
            if (page.getResources().isImageXObject(name)) {
                PDImageXObject image = (PDImageXObject) page.getResources().getXObject(name);

                // Using hashCode for simplicity here, not as robust as MD5 hashing
                int imageHash = image.hashCode();

                synchronized (processedImages) {
                    if (processedImages.contains(imageHash)) {
                        continue;
                    }
                    processedImages.add(imageHash);
                }

                RenderedImage renderedImage = image.getImage();
                BufferedImage bufferedImage = createBufferedImage(renderedImage, format);
                String imageName =
                        filename + "_" + imageIndex + " (Page " + pageNum + ")." + format;

                synchronized (zos) { // Synchronize writing to the ZipOutputStream
                    ZipEntry zipEntry = new ZipEntry(imageName);
                    zos.putNextEntry(zipEntry);

                    Graphics2D g = bufferedImage.createGraphics();
                    g.drawImage((Image) renderedImage, 0, 0, null);
                    g.dispose();

                    ByteArrayOutputStream imageBaos = new ByteArrayOutputStream();
                    ImageIO.write(bufferedImage, format, imageBaos);
                    zos.write(imageBaos.toByteArray());
                    zos.closeEntry();
                }

                imageIndex++;
            }
        }
    }

    /**
     * Converts the given rendered image to a BufferedImage in the RGB color model.
     *
     * @param renderedImage The input rendered image to be converted.
     * @param format The desired output image format.
     * @return A BufferedImage in RGB color model.
     */
    private BufferedImage createBufferedImage(RenderedImage renderedImage, String format) {
        int width = renderedImage.getWidth();
        int height = renderedImage.getHeight();
        BufferedImage rgbImage = null;

        if ("png".equalsIgnoreCase(format)) {
            rgbImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        } else if ("jpeg".equalsIgnoreCase(format) || "jpg".equalsIgnoreCase(format)) {
            rgbImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        } else if ("gif".equalsIgnoreCase(format)) {
            rgbImage = new BufferedImage(width, height, BufferedImage.TYPE_BYTE_INDEXED);
        }

        return rgbImage;
    }
}
