package stirling.software.SPDF.controller.api.converters;

import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.URLConnection;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.commons.io.FileUtils;
import org.apache.pdfbox.rendering.ImageType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.converters.ConvertToImageRequest;
import stirling.software.SPDF.model.api.converters.ConvertToPdfRequest;
import stirling.software.SPDF.utils.CheckProgramInstall;
import stirling.software.SPDF.utils.PdfUtils;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/convert")
@Tag(name = "Convert", description = "Convert APIs")
public class ConvertImgPDFController {

    private static final Logger logger = LoggerFactory.getLogger(ConvertImgPDFController.class);

    @PostMapping(consumes = "multipart/form-data", value = "/pdf/img")
    @Operation(
            summary = "Convert PDF to image(s)",
            description =
                    "This endpoint converts a PDF file to image(s) with the specified image format, color type, and DPI. Users can choose to get a single image or multiple images.  Input:PDF Output:Image Type:SI-Conditional")
    public ResponseEntity<byte[]> convertToImage(@ModelAttribute ConvertToImageRequest request)
            throws NumberFormatException, Exception {
        MultipartFile file = request.getFileInput();
        String imageFormat = request.getImageFormat();
        String singleOrMultiple = request.getSingleOrMultiple();
        String colorType = request.getColorType();
        String dpi = request.getDpi();

        byte[] pdfBytes = file.getBytes();
        ImageType colorTypeResult = ImageType.RGB;
        if ("greyscale".equals(colorType)) {
            colorTypeResult = ImageType.GRAY;
        } else if ("blackwhite".equals(colorType)) {
            colorTypeResult = ImageType.BINARY;
        }
        // returns bytes for image
        boolean singleImage = "single".equals(singleOrMultiple);
        byte[] result = null;
        String filename =
                Filenames.toSimpleFileName(file.getOriginalFilename())
                        .replaceFirst("[.][^.]+$", "");

        result =
                PdfUtils.convertFromPdf(
                        pdfBytes,
                        imageFormat.equalsIgnoreCase("webp") ? "png" : imageFormat.toUpperCase(),
                        colorTypeResult,
                        singleImage,
                        Integer.valueOf(dpi),
                        filename);
        if (result == null || result.length == 0) {
            logger.error("resultant bytes for {} is null, error converting ", filename);
        }
        if (imageFormat.equalsIgnoreCase("webp") && !CheckProgramInstall.isPythonAvailable()) {
            throw new IOException("Python is not installed. Required for WebP conversion.");
        } else if (imageFormat.equalsIgnoreCase("webp")
                && CheckProgramInstall.isPythonAvailable()) {
            // Write the output stream to a temp file
            Path tempFile = Files.createTempFile("temp_png", ".png");
            try (FileOutputStream fos = new FileOutputStream(tempFile.toFile())) {
                fos.write(result);
                fos.flush();
            }

            String pythonVersion = CheckProgramInstall.getAvailablePythonCommand();

            List<String> command = new ArrayList<>();
            command.add(pythonVersion);
            command.add("./scripts/png_to_webp.py"); // Python script to handle the conversion

            // Create a temporary directory for the output WebP files
            Path tempOutputDir = Files.createTempDirectory("webp_output");
            if (singleImage) {
                // Run the Python script to convert PNG to WebP
                command.add(tempFile.toString());
                command.add(tempOutputDir.toString());
                command.add("--single");
            } else {
                // Save the uploaded PDF to a temporary file
                Path tempPdfPath = Files.createTempFile("temp_pdf", ".pdf");
                file.transferTo(tempPdfPath.toFile());
                // Run the Python script to convert PDF to WebP
                command.add(tempPdfPath.toString());
                command.add(tempOutputDir.toString());
            }
            command.add("--dpi");
            command.add(dpi);
            ProcessExecutorResult resultProcess =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV)
                            .runCommandWithOutputHandling(command);

            // Find all WebP files in the output directory
            List<Path> webpFiles =
                    Files.walk(tempOutputDir)
                            .filter(path -> path.toString().endsWith(".webp"))
                            .collect(Collectors.toList());

            if (webpFiles.isEmpty()) {
                logger.error("No WebP files were created in: {}", tempOutputDir.toString());
                throw new IOException("No WebP files were created. " + resultProcess.getMessages());
            }

            byte[] bodyBytes = new byte[0];

            if (webpFiles.size() == 1) {
                // Return the single WebP file directly
                Path webpFilePath = webpFiles.get(0);
                bodyBytes = Files.readAllBytes(webpFilePath);
            } else {
                // Create a ZIP file containing all WebP images
                ByteArrayOutputStream zipOutputStream = new ByteArrayOutputStream();
                try (ZipOutputStream zos = new ZipOutputStream(zipOutputStream)) {
                    for (Path webpFile : webpFiles) {
                        zos.putNextEntry(new ZipEntry(webpFile.getFileName().toString()));
                        Files.copy(webpFile, zos);
                        zos.closeEntry();
                    }
                }
                bodyBytes = zipOutputStream.toByteArray();
            }
            // Clean up the temporary files
            Files.deleteIfExists(tempFile);
            if (tempOutputDir != null) FileUtils.deleteDirectory(tempOutputDir.toFile());
            result = bodyBytes;
        }

        if (singleImage) {
            String docName = filename + "." + imageFormat;
            MediaType mediaType = MediaType.parseMediaType(getMediaType(imageFormat));
            return WebResponseUtils.bytesToWebResponse(result, docName, mediaType);
        } else {
            String zipFilename = filename + "_convertedToImages.zip";
            return WebResponseUtils.bytesToWebResponse(
                    result, zipFilename, MediaType.APPLICATION_OCTET_STREAM);
        }
    }

    @PostMapping(consumes = "multipart/form-data", value = "/img/pdf")
    @Operation(
            summary = "Convert images to a PDF file",
            description =
                    "This endpoint converts one or more images to a PDF file. Users can specify whether to stretch the images to fit the PDF page, and whether to automatically rotate the images. Input:Image Output:PDF Type:MISO")
    public ResponseEntity<byte[]> convertToPdf(@ModelAttribute ConvertToPdfRequest request)
            throws IOException {
        MultipartFile[] file = request.getFileInput();
        String fitOption = request.getFitOption();
        String colorType = request.getColorType();
        boolean autoRotate = request.isAutoRotate();

        // Convert the file to PDF and get the resulting bytes
        byte[] bytes = PdfUtils.imageToPdf(file, fitOption, autoRotate, colorType);
        return WebResponseUtils.bytesToWebResponse(
                bytes,
                file[0].getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_converted.pdf");
    }

    private String getMediaType(String imageFormat) {
        String mimeType = URLConnection.guessContentTypeFromName("." + imageFormat);
        return "null".equals(mimeType) ? "application/octet-stream" : mimeType;
    }
}
