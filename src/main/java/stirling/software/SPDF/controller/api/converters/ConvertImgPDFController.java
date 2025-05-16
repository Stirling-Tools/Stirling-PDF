package stirling.software.SPDF.controller.api.converters;

import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.URLConnection;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.commons.io.FileUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.rendering.ImageType;
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

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.converters.ConvertToImageRequest;
import stirling.software.SPDF.model.api.converters.ConvertToPdfRequest;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.*;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;

@RestController
@RequestMapping("/api/v1/convert")
@Slf4j
@Tag(name = "Convert", description = "Convert APIs")
@RequiredArgsConstructor
public class ConvertImgPDFController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(consumes = "multipart/form-data", value = "/pdf/img")
    @Operation(
            summary = "Convert PDF to image(s)",
            description =
                    "This endpoint converts a PDF file to image(s) with the specified image format,"
                            + " color type, and DPI. Users can choose to get a single image or multiple"
                            + " images.  Input:PDF Output:Image Type:SI-Conditional")
    public ResponseEntity<byte[]> convertToImage(@ModelAttribute ConvertToImageRequest request)
            throws NumberFormatException, Exception {
        MultipartFile file = request.getFileInput();
        String imageFormat = request.getImageFormat();
        String singleOrMultiple = request.getSingleOrMultiple();
        String colorType = request.getColorType();
        int dpi = request.getDpi();
        String pageNumbers = request.getPageNumbers();
        Path tempFile = null;
        Path tempOutputDir = null;
        Path tempPdfPath = null;
        byte[] result = null;
        String[] pageOrderArr =
                (pageNumbers != null && !pageNumbers.trim().isEmpty())
                        ? pageNumbers.split(",")
                        : new String[] {"all"};
        ;
        try {
            // Load the input PDF
            byte[] newPdfBytes = rearrangePdfPages(file, pageOrderArr);

            ImageType colorTypeResult = ImageType.RGB;
            if ("greyscale".equals(colorType)) {
                colorTypeResult = ImageType.GRAY;
            } else if ("blackwhite".equals(colorType)) {
                colorTypeResult = ImageType.BINARY;
            }
            // returns bytes for image
            boolean singleImage = "single".equals(singleOrMultiple);
            String filename =
                    Filenames.toSimpleFileName(file.getOriginalFilename())
                            .replaceFirst("[.][^.]+$", "");

            result =
                    PdfUtils.convertFromPdf(
                            pdfDocumentFactory,
                            newPdfBytes,
                            "webp".equalsIgnoreCase(imageFormat)
                                    ? "png"
                                    : imageFormat.toUpperCase(),
                            colorTypeResult,
                            singleImage,
                            dpi,
                            filename);
            if (result == null || result.length == 0) {
                log.error("resultant bytes for {} is null, error converting ", filename);
            }
            if ("webp".equalsIgnoreCase(imageFormat) && !CheckProgramInstall.isPythonAvailable()) {
                throw new IOException("Python is not installed. Required for WebP conversion.");
            } else if ("webp".equalsIgnoreCase(imageFormat)
                    && CheckProgramInstall.isPythonAvailable()) {
                // Write the output stream to a temp file
                tempFile = Files.createTempFile("temp_png", ".png");
                try (FileOutputStream fos = new FileOutputStream(tempFile.toFile())) {
                    fos.write(result);
                    fos.flush();
                }

                String pythonVersion = CheckProgramInstall.getAvailablePythonCommand();

                List<String> command = new ArrayList<>();
                command.add(pythonVersion);
                command.add("./scripts/png_to_webp.py"); // Python script to handle the conversion

                // Create a temporary directory for the output WebP files
                tempOutputDir = Files.createTempDirectory("webp_output");
                if (singleImage) {
                    // Run the Python script to convert PNG to WebP
                    command.add(tempFile.toString());
                    command.add(tempOutputDir.toString());
                    command.add("--single");
                } else {
                    // Save the uploaded PDF to a temporary file
                    tempPdfPath = Files.createTempFile("temp_pdf", ".pdf");
                    file.transferTo(tempPdfPath.toFile());
                    // Run the Python script to convert PDF to WebP
                    command.add(tempPdfPath.toString());
                    command.add(tempOutputDir.toString());
                }
                command.add("--dpi");
                command.add(String.valueOf(dpi));
                ProcessExecutorResult resultProcess =
                        ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV)
                                .runCommandWithOutputHandling(command);

                // Find all WebP files in the output directory
                List<Path> webpFiles =
                        Files.walk(tempOutputDir)
                                .filter(path -> path.toString().endsWith(".webp"))
                                .toList();

                if (webpFiles.isEmpty()) {
                    log.error("No WebP files were created in: {}", tempOutputDir.toString());
                    throw new IOException(
                            "No WebP files were created. " + resultProcess.getMessages());
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

        } finally {
            try {
                // Clean up temporary files
                if (tempFile != null) {
                    Files.deleteIfExists(tempFile);
                }
                if (tempPdfPath != null) {
                    Files.deleteIfExists(tempPdfPath);
                }
                if (tempOutputDir != null) {
                    FileUtils.deleteDirectory(tempOutputDir.toFile());
                }
            } catch (Exception e) {
                log.error("Error cleaning up temporary files", e);
            }
        }
    }

    @PostMapping(consumes = "multipart/form-data", value = "/img/pdf")
    @Operation(
            summary = "Convert images to a PDF file",
            description =
                    "This endpoint converts one or more images to a PDF file. Users can specify"
                            + " whether to stretch the images to fit the PDF page, and whether to"
                            + " automatically rotate the images. Input:Image Output:PDF Type:MISO")
    public ResponseEntity<byte[]> convertToPdf(@ModelAttribute ConvertToPdfRequest request)
            throws IOException {
        MultipartFile[] file = request.getFileInput();
        String fitOption = request.getFitOption();
        String colorType = request.getColorType();
        boolean autoRotate = Boolean.TRUE.equals(request.getAutoRotate());
        // Handle Null entries for formdata
        if (colorType == null || colorType.isBlank()) {
            colorType = "color";
        }
        if (fitOption == null || fitOption.isEmpty()) {
            fitOption = "fillPage";
        }
        // Convert the file to PDF and get the resulting bytes
        byte[] bytes =
                PdfUtils.imageToPdf(file, fitOption, autoRotate, colorType, pdfDocumentFactory);
        return WebResponseUtils.bytesToWebResponse(
                bytes,
                file[0].getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_converted.pdf");
    }

    private String getMediaType(String imageFormat) {
        String mimeType = URLConnection.guessContentTypeFromName("." + imageFormat);
        return "null".equals(mimeType) ? "application/octet-stream" : mimeType;
    }

    /**
     * Rearranges the pages of the given PDF document based on the specified page order.
     *
     * @param pdfBytes The byte array of the original PDF file.
     * @param pageOrderArr An array of page numbers indicating the new order.
     * @return A byte array of the rearranged PDF.
     * @throws IOException If an error occurs while processing the PDF.
     */
    private byte[] rearrangePdfPages(MultipartFile pdfFile, String[] pageOrderArr)
            throws IOException {
        // Load the input PDF
        PDDocument document = pdfDocumentFactory.load(pdfFile);
        int totalPages = document.getNumberOfPages();
        List<Integer> newPageOrder = GeneralUtils.parsePageList(pageOrderArr, totalPages, false);

        // Create a new list to hold the pages in the new order
        List<PDPage> newPages = new ArrayList<>();
        for (int pageIndex : newPageOrder) {
            newPages.add(document.getPage(pageIndex));
        }

        // Remove all the pages from the original document
        for (int i = document.getNumberOfPages() - 1; i >= 0; i--) {
            document.removePage(i);
        }

        // Add the pages in the new order
        for (PDPage page : newPages) {
            document.addPage(page);
        }

        // Convert PDDocument to byte array
        byte[] newPdfBytes;
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            document.save(baos);
            newPdfBytes = baos.toByteArray();
        } finally {
            document.close();
        }

        return newPdfBytes;
    }
}
