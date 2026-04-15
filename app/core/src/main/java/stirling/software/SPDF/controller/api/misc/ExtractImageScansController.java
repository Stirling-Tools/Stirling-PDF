package stirling.software.SPDF.controller.api.misc;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;

import org.apache.commons.io.FileUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.MultiFileResponse;
import stirling.software.SPDF.model.api.misc.ExtractImageScansRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ApplicationContextProvider;
import stirling.software.common.util.CheckProgramInstall;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class ExtractImageScansController {

    private static final String REPLACEFIRST = "[.][^.]+$";

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/extract-image-scans")
    @MultiFileResponse
    @Operation(
            summary = "Extract image scans from an input file",
            description =
                    "This endpoint extracts image scans from a given file based on certain"
                            + " parameters. Users can specify angle threshold, tolerance, minimum area,"
                            + " minimum contour area, and border size. Input:PDF Output:IMAGE/ZIP"
                            + " Type:SIMO")
    public ResponseEntity<StreamingResponseBody> extractImageScans(
            @ModelAttribute ExtractImageScansRequest request)
            throws IOException, InterruptedException {
        MultipartFile inputFile = request.getFileInput();

        String fileName = inputFile.getOriginalFilename();
        String extension = fileName.substring(fileName.lastIndexOf('.') + 1);

        List<String> images = new ArrayList<>();

        List<TempFile> tempImageFiles = new ArrayList<>();
        TempFile tempInputFile = null;
        List<Path> tempDirs = new ArrayList<>();

        if (!CheckProgramInstall.isPythonAvailable()) {
            throw ExceptionUtils.createIOException(
                    "error.toolNotInstalled", "{0} is not installed", null, "Python");
        }

        String pythonVersion = CheckProgramInstall.getAvailablePythonCommand();
        Path splitPhotosScript = GeneralUtils.extractScript("split_photos.py");
        TempFile finalOutput = null;
        boolean finalOutputOwnershipTransferred = false;
        try {
            // Check if input file is a PDF
            if ("pdf".equalsIgnoreCase(extension)) {
                // Load PDF document
                try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
                    PDFRenderer pdfRenderer = new PDFRenderer(document);
                    pdfRenderer.setSubsamplingAllowed(true);
                    int pageCount = document.getNumberOfPages();
                    images = new ArrayList<>();

                    // Create images of all pages
                    for (int i = 0; i < pageCount; i++) {
                        // Create temp file to save the image
                        TempFile tempImage = tempFileManager.createManagedTempFile(".png");
                        tempImageFiles.add(tempImage);

                        // Render image and save as temp file
                        BufferedImage image;

                        // Use global maximum DPI setting, fallback to 300 if not set
                        int renderDpi = 300; // Default fallback
                        ApplicationProperties properties =
                                ApplicationContextProvider.getBean(ApplicationProperties.class);
                        if (properties != null && properties.getSystem() != null) {
                            renderDpi = properties.getSystem().getMaxDPI();
                        }
                        final int dpi = renderDpi;
                        final int pageIndex = i;

                        image =
                                ExceptionUtils.handleOomRendering(
                                        pageIndex + 1,
                                        dpi,
                                        () -> pdfRenderer.renderImageWithDPI(pageIndex, dpi));
                        ImageIO.write(image, "png", tempImage.getFile());

                        // Add temp file path to images list
                        images.add(tempImage.getAbsolutePath());
                    }
                }
            } else {
                tempInputFile = tempFileManager.createManagedTempFile("." + extension);
                inputFile.transferTo(tempInputFile.getFile());
                // Add input file path to images list
                images.add(tempInputFile.getAbsolutePath());
            }

            List<byte[]> processedImageBytes = new ArrayList<>();

            // Process each image
            for (int i = 0; i < images.size(); i++) {

                Path tempDir = Files.createTempDirectory("openCV_output");
                tempDirs.add(tempDir);
                List<String> command =
                        new ArrayList<>(
                                Arrays.asList(
                                        pythonVersion,
                                        splitPhotosScript.toAbsolutePath().toString(),
                                        images.get(i),
                                        tempDir.toString(),
                                        "--angle_threshold",
                                        String.valueOf(request.getAngleThreshold()),
                                        "--tolerance",
                                        String.valueOf(request.getTolerance()),
                                        "--min_area",
                                        String.valueOf(request.getMinArea()),
                                        "--min_contour_area",
                                        String.valueOf(request.getMinContourArea()),
                                        "--border_size",
                                        String.valueOf(request.getBorderSize())));

                // Run CLI command
                ProcessExecutorResult returnCode =
                        ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV)
                                .runCommandWithOutputHandling(command);

                // Read the output photos in temp directory
                List<Path> tempOutputFiles;
                try (Stream<Path> listStream = Files.list(tempDir)) {
                    tempOutputFiles = listStream.sorted().toList();
                }
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
                        GeneralUtils.generateFilename(fileName, "_processed.zip");
                finalOutput = tempFileManager.createManagedTempFile(".zip");

                try (ZipOutputStream zipOut =
                        new ZipOutputStream(Files.newOutputStream(finalOutput.getPath()))) {
                    // Add processed images to the zip
                    for (int i = 0; i < processedImageBytes.size(); i++) {
                        ZipEntry entry =
                                new ZipEntry(
                                        GeneralUtils.generateFilename(
                                                fileName, "_processed_" + (i + 1) + ".png"));
                        zipOut.putNextEntry(entry);
                        zipOut.write(processedImageBytes.get(i));
                        zipOut.closeEntry();
                    }
                }

                ResponseEntity<StreamingResponseBody> response =
                        WebResponseUtils.zipFileToWebResponse(finalOutput, outputZipFilename);
                finalOutputOwnershipTransferred = true;
                return response;
            }
            if (processedImageBytes.isEmpty()) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.noContent", "No {0} detected", "images");
            } else {

                // Return the processed image as a response
                byte[] imageBytes = processedImageBytes.get(0);
                finalOutput = tempFileManager.createManagedTempFile(".png");
                try (OutputStream out = Files.newOutputStream(finalOutput.getPath())) {
                    out.write(imageBytes);
                }

                ResponseEntity<StreamingResponseBody> response =
                        WebResponseUtils.fileToWebResponse(
                                finalOutput,
                                GeneralUtils.generateFilename(fileName, ".png"),
                                MediaType.IMAGE_PNG);
                finalOutputOwnershipTransferred = true;
                return response;
            }
        } finally {
            if (finalOutput != null && !finalOutputOwnershipTransferred) {
                finalOutput.close();
            }
            // Cleanup logic for all temporary files and directories
            tempImageFiles.forEach(TempFile::close);

            if (tempInputFile != null) {
                tempInputFile.close();
            }

            tempDirs.forEach(
                    dir -> {
                        try {
                            FileUtils.deleteDirectory(dir.toFile());
                        } catch (IOException e) {
                            log.error("Failed to delete temporary directory: {}", dir, e);
                        }
                    });
        }
    }
}
