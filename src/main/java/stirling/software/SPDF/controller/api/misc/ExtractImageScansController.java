package stirling.software.SPDF.controller.api.misc;

import java.awt.image.BufferedImage;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;

import org.apache.commons.io.FileUtils;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.misc.ExtractImageScansRequest;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class ExtractImageScansController {

    private static final Logger logger = LoggerFactory.getLogger(ExtractImageScansController.class);

    @PostMapping(consumes = "multipart/form-data", value = "/extract-image-scans")
    @Operation(
            summary = "Extract image scans from an input file",
            description =
                    "This endpoint extracts image scans from a given file based on certain parameters. Users can specify angle threshold, tolerance, minimum area, minimum contour area, and border size. Input:PDF Output:IMAGE/ZIP Type:SIMO")
    public ResponseEntity<byte[]> extractImageScans(
            @RequestBody(
                            description = "Form data containing file and extraction parameters",
                            required = true,
                            content =
                                    @Content(
                                            mediaType = "multipart/form-data",
                                            schema =
                                                    @Schema(
                                                            implementation =
                                                                    ExtractImageScansRequest
                                                                            .class) // This should
                                            // represent
                                            // your form's
                                            // structure
                                            ))
                    ExtractImageScansRequest form)
            throws IOException, InterruptedException {
        String fileName = form.getFileInput().getOriginalFilename();
        String extension = fileName.substring(fileName.lastIndexOf(".") + 1);

        List<String> images = new ArrayList<>();

        List<Path> tempImageFiles = new ArrayList<>();
        Path tempInputFile = null;
        Path tempZipFile = null;
        List<Path> tempDirs = new ArrayList<>();

        try {
            // Check if input file is a PDF
            if ("pdf".equalsIgnoreCase(extension)) {
                // Load PDF document
                try (PDDocument document = Loader.loadPDF(form.getFileInput().getBytes())) {
                    PDFRenderer pdfRenderer = new PDFRenderer(document);
                    pdfRenderer.setSubsamplingAllowed(true);
                    int pageCount = document.getNumberOfPages();
                    images = new ArrayList<>();

                    // Create images of all pages
                    for (int i = 0; i < pageCount; i++) {
                        // Create temp file to save the image
                        Path tempFile = Files.createTempFile("image_", ".png");

                        // Render image and save as temp file
                        BufferedImage image = pdfRenderer.renderImageWithDPI(i, 300);
                        ImageIO.write(image, "png", tempFile.toFile());

                        // Add temp file path to images list
                        images.add(tempFile.toString());
                        tempImageFiles.add(tempFile);
                    }
                }
            } else {
                tempInputFile = Files.createTempFile("input_", "." + extension);
                form.getFileInput().transferTo(tempInputFile);
                // Add input file path to images list
                images.add(tempInputFile.toString());
            }

            List<byte[]> processedImageBytes = new ArrayList<>();

            // Process each image
            for (int i = 0; i < images.size(); i++) {

                Path tempDir = Files.createTempDirectory("openCV_output");
                tempDirs.add(tempDir);
                List<String> command =
                        new ArrayList<>(
                                Arrays.asList(
                                        "python3",
                                        "./scripts/split_photos.py",
                                        images.get(i),
                                        tempDir.toString(),
                                        "--angle_threshold",
                                        String.valueOf(form.getAngleThreshold()),
                                        "--tolerance",
                                        String.valueOf(form.getTolerance()),
                                        "--min_area",
                                        String.valueOf(form.getMinArea()),
                                        "--min_contour_area",
                                        String.valueOf(form.getMinContourArea()),
                                        "--border_size",
                                        String.valueOf(form.getBorderSize())));

                // Run CLI command
                ProcessExecutorResult returnCode =
                        ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV)
                                .runCommandWithOutputHandling(command);

                // Read the output photos in temp directory
                List<Path> tempOutputFiles = Files.list(tempDir).sorted().toList();
                for (Path tempOutputFile : tempOutputFiles) {
                    byte[] imageBytes = Files.readAllBytes(tempOutputFile);
                    processedImageBytes.add(imageBytes);
                }
                // Clean up the temporary directory
                FileUtils.deleteDirectory(tempDir.toFile());
            }

            // Create zip file if multiple images
            if (processedImageBytes.size() > 1) {
                String outputZipFilename =
                        fileName.replaceFirst(REPLACEFIRST, "") + "_processed.zip";
                tempZipFile = Files.createTempFile("output_", ".zip");

                try (ZipOutputStream zipOut =
                        new ZipOutputStream(new FileOutputStream(tempZipFile.toFile()))) {
                    // Add processed images to the zip
                    for (int i = 0; i < processedImageBytes.size(); i++) {
                        ZipEntry entry =
                                new ZipEntry(
                                        fileName.replaceFirst(REPLACEFIRST, "")
                                                + "_"
                                                + (i + 1)
                                                + ".png");
                        zipOut.putNextEntry(entry);
                        zipOut.write(processedImageBytes.get(i));
                        zipOut.closeEntry();
                    }
                }

                byte[] zipBytes = Files.readAllBytes(tempZipFile);

                // Clean up the temporary zip file
                Files.deleteIfExists(tempZipFile);

                return WebResponseUtils.bytesToWebResponse(
                        zipBytes, outputZipFilename, MediaType.APPLICATION_OCTET_STREAM);
            }
            if (processedImageBytes.size() == 0) {
                throw new IllegalArgumentException("No images detected");
            } else {

                // Return the processed image as a response
                byte[] imageBytes = processedImageBytes.get(0);
                return WebResponseUtils.bytesToWebResponse(
                        imageBytes,
                        fileName.replaceFirst(REPLACEFIRST, "") + ".png",
                        MediaType.IMAGE_PNG);
            }
        } finally {
            // Cleanup logic for all temporary files and directories
            tempImageFiles.forEach(
                    path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException e) {
                            logger.error("Failed to delete temporary image file: " + path, e);
                        }
                    });

            if (tempZipFile != null && Files.exists(tempZipFile)) {
                try {
                    Files.deleteIfExists(tempZipFile);
                } catch (IOException e) {
                    logger.error("Failed to delete temporary zip file: " + tempZipFile, e);
                }
            }

            tempDirs.forEach(
                    dir -> {
                        try {
                            FileUtils.deleteDirectory(dir.toFile());
                        } catch (IOException e) {
                            logger.error("Failed to delete temporary directory: " + dir, e);
                        }
                    });
        }
    }

    private static final String REPLACEFIRST = "[.][^.]+$";
}
