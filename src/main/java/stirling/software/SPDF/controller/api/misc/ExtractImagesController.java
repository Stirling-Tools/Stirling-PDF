package stirling.software.SPDF.controller.api.misc;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.awt.image.RenderedImage;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;

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

import io.github.pixee.security.Filenames;

import stirling.software.SPDF.config.MemoryConfig;
import stirling.software.SPDF.model.api.PDFWithImageFormatRequest;
import stirling.software.SPDF.utils.WebResponseUtils;
import stirling.software.SPDF.utils.memoryUtils;

@RestController
@RequestMapping("/api/v1/misc")
public class ExtractImagesController {

    private static final Logger logger = LoggerFactory.getLogger(ExtractImagesController.class);

    @Autowired private MemoryConfig memoryconfig; // Inject MemoryConfig

    @PostMapping(consumes = "multipart/form-data", value = "/extract-images")
    public ResponseEntity<byte[]> extractImages(@ModelAttribute PDFWithImageFormatRequest request)
            throws IOException, InterruptedException, ExecutionException {
        MultipartFile file = request.getFileInput();
        String format = request.getFormat();

        System.out.println(
                System.currentTimeMillis() + " file=" + file.getName() + ", format=" + format);

        // Determine if we should use file-based storage based on available RAM
        boolean useFile = memoryUtils.shouldUseFileBasedStorage(memoryconfig);

        PDDocument document;
        // Create a temporary directory for processing
        Path tempDir = Files.createTempDirectory("image-processing-");

        // If useFile is true, save the PDF to disk first
        File tempFile = null;
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

        // Determine if multithreading should be used based on PDF size or number of pages
        boolean useMultithreading = shouldUseMultithreading(file, document);
        String filename =
                Filenames.toSimpleFileName(file.getOriginalFilename())
                        .replaceFirst("[.][^.]+$", "");
        Set<Integer> processedImages = new HashSet<>();

        if (useMultithreading) {
            // Executor service to handle multithreading
            ExecutorService executor =
                    Executors.newFixedThreadPool(Runtime.getRuntime().availableProcessors());
            Set<Future<Void>> futures = new HashSet<>();

            // Iterate over each page
            for (int pgNum = 0; pgNum < document.getPages().getCount(); pgNum++) {
                PDPage page = document.getPage(pgNum);
                int pageNum = document.getPages().indexOf(page) + 1;
                // Submit a task for processing each page
                Future<Void> future =
                        executor.submit(
                                () -> {
                                    try {
                                        extractImagesFromPage(page, format, tempDir, pageNum);

                                    } catch (IOException e) {
                                        logger.error("Error extracting images from page", e);
                                    }
                                    return null;
                                });

                futures.add(future);
            }

            // Wait for all tasks to complete
            for (Future<Void> future : futures) {
                future.get();
            }

            // Close executor service
            executor.shutdown();
        } else {
            // Single-threaded extraction
            for (int pgNum = 0; pgNum < document.getPages().getCount(); pgNum++) {
                PDPage page = document.getPage(pgNum);

                extractImagesFromPage(page, format, tempDir, pgNum + 1);
            }
        }
        // Create a ZIP file from the temporary directory
        Path tempZipFile = Files.createTempFile("output_", ".zip");
        try (ZipOutputStream zipOut =
                new ZipOutputStream(new FileOutputStream(tempZipFile.toFile()))) {
            // Add processed images to the zip
            Files.list(tempDir)
                    .sorted()
                    .forEach(
                            tempOutputFile -> {
                                try {
                                    String imageName = tempOutputFile.getFileName().toString();
                                    zipOut.putNextEntry(new ZipEntry(imageName));
                                    Files.copy(tempOutputFile, zipOut);
                                    zipOut.closeEntry();
                                } catch (IOException e) {
                                    logger.error("Error adding file to zip", e);
                                }
                            });
        }
        byte[] zipBytes = Files.readAllBytes(tempZipFile);
        // Clean up the temporary files
        Files.deleteIfExists(tempZipFile);
        FileUtils.deleteDirectory(tempDir.toFile());
        if (useFile && tempFile != null) {
            tempFile.delete();
        }
        return WebResponseUtils.bytesToWebResponse(
                zipBytes,
                file.getOriginalFilename() + "_extracted-images.zip",
                MediaType.APPLICATION_OCTET_STREAM);
    }

    private boolean shouldUseMultithreading(MultipartFile file, PDDocument document) {
        // Criteria: Use multithreading if file size > 10MB or number of pages > 20
        long fileSizeInMB = file.getSize() / (1024 * 1024);
        int numberOfPages = document.getPages().getCount();
        return fileSizeInMB > 10 || numberOfPages > 20;
    }

    private void extractImagesFromPage(PDPage page, String format, Path tempDir, int pageNum)
            throws IOException {
        synchronized (page) {
            for (COSName name : page.getResources().getXObjectNames()) {
                if (page.getResources().isImageXObject(name)) {
                    PDImageXObject image = (PDImageXObject) page.getResources().getXObject(name);
                    BufferedImage bufferedImage = convertToRGB(image.getImage(), format);

                    // Save the image to the temporary directory
                    Path imagePath =
                            tempDir.resolve(
                                    "image_" + pageNum + "_" + name.getName() + "." + format);
                    ImageIO.write(bufferedImage, format, imagePath.toFile());
                }
            }
        }
    }

    private BufferedImage convertToRGB(RenderedImage renderedImage, String format) {
        int width = renderedImage.getWidth();
        int height = renderedImage.getHeight();
        BufferedImage rgbImage;
        try {
            if ("png".equalsIgnoreCase(format)) {
                rgbImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
            } else if ("jpeg".equalsIgnoreCase(format) || "jpg".equalsIgnoreCase(format)) {
                rgbImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            } else if ("gif".equalsIgnoreCase(format)) {
                rgbImage = new BufferedImage(width, height, BufferedImage.TYPE_BYTE_INDEXED);
            } else {
                rgbImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            }

            Graphics2D g = rgbImage.createGraphics();
            g.drawImage((Image) renderedImage, 0, 0, null);
            g.dispose();
        } catch (java.lang.NullPointerException e) {
            logger.error("NullPointerException while converting image to RGB format", e);
            rgbImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = rgbImage.createGraphics();
            // g.setBackground(Color.WHITE);
            g.clearRect(0, 0, width, height);
            g.dispose();
        } catch (java.lang.IllegalArgumentException e) {
            logger.error("IllegalArgumentException while converting image to RGB format", e);
            rgbImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = rgbImage.createGraphics();
            // g.setBackground(Color.WHITE);
            g.clearRect(0, 0, width, height);
            g.dispose();
        } catch (Exception e) {
            logger.error("Unexpected error while converting image to RGB format", e);
            rgbImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = rgbImage.createGraphics();
            // g.setBackground(Color.WHITE);
            g.clearRect(0, 0, width, height);
            g.dispose();
        }
        return rgbImage;
    }
}
